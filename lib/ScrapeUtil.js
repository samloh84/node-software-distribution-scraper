const _ = require('lodash');
const _path = require('path');
const _url = require('url');
const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs-extra'));
const moment = require('moment');
const sprintf = require('sprintf-js').sprintf;
const targz = require('tar.gz');
const AdmZip = require('adm-zip');

const maxCacheTime = 7 * 24 * 60 * 60 * 1000;
const maxRetries = 3;

var ScrapeUtil = {};

/**
 *
 * @param links {string[]|string[][]}
 * @returns {string[]}
 */
ScrapeUtil.normalize = function (links) {
    return _.filter(_.uniq(_.flatten(links)), _.negate(_.isNil));
};

ScrapeUtil.hash = function (string) {
    var hash = crypto.createHash('sha256');

    hash.update(string);
    return hash.digest('hex');
};


/**
 *
 * @param options
 * @param options.url {string|string[]}
 * @param options.callback {function}
 * @param options.requestOptions {object}
 * @returns {Promise.<string[]>}
 */
ScrapeUtil.retrieve = function (options) {
    var url = _.get(options, 'url');
    var concurrency = _.get(options, 'concurrency', 20);

    if (_.isArray(url)) {
        url = ScrapeUtil.normalize(url);
        return Promise.map(url, function (url) {
            return ScrapeUtil.retrieve(_.merge({}, options, {url: url}));
        }, {concurrency: concurrency})
            .then(function (links) {
                links = ScrapeUtil.normalize(links);
                links.sort();
                return links;
            });
    }

    var callback = _.get(options, 'callback');
    var requestOptions = _.get(options, 'requestOptions');

    console.log('Retrieving URL ' + url);


    var urlKey = ScrapeUtil.hash(url);
    var cacheFilePath = _path.resolve(process.cwd(), 'cache', urlKey);

    return ScrapeUtil.readJsonAsync(cacheFilePath)
        .then(function (cachedResponse) {

            if (!_.isNil(cachedResponse)) {
                var currentTimestamp = moment().valueOf();
                var retrievedTimestamp = _.get(cachedResponse, 'timestamp');
                var status = _.get(cachedResponse, 'status');
                if (!_.isNil(status) && status === 200
                    && !_.isNil(retrievedTimestamp) && currentTimestamp < (retrievedTimestamp + maxCacheTime)) {
                    console.log('Retrieved URL ' + url + ' from cache');
                    return cachedResponse;
                }
            }

            var tries = 0;

            function retrieve() {
                return axios(url, _.merge({}, requestOptions, {Promise: Promise}))
                    .then(function (response) {
                        console.log('Retrieved URL ' + url);

                        var retrievedTimestamp = moment().valueOf();

                        var responseToCache = _.pick(response, ['headers', 'status', 'statusText', 'data']);
                        responseToCache = _.merge({}, responseToCache, {timestamp: retrievedTimestamp});
                        tries++;
                        return ScrapeUtil.writeJsonAsync(cacheFilePath, responseToCache)
                            .then(function () {
                                return response;
                            });
                    })
                    .catch(function (err) {
                        tries++;
                        console.error(err);
                        if ((tries + 1) < maxRetries) {
                            return retrieve();
                        } else {
                            throw err;
                        }
                    })
            }


            return retrieve();

        })
        .then(function (response) {
            return callback(response, url);
        })
        .catch(function (err) {
            if (!_.isNil(err.response) && (err.response.status == 301 || err.response.status == 302)) {
                return callback(err.response, url);
            } else {
                console.error(sprintf("Error retrieving %s\n%s", url, err.stack));
            }
        });

};


ScrapeUtil.download = function (options) {
    var url = _.get(options, 'url');
    var file = _.get(options, 'file');
    file = _path.resolve(process.cwd(), file);
    var headers = _.get(options, 'headers');


    console.log(sprintf('Downloading %s', url));
    return axios({
        url: url, headers: headers, responseType: 'stream'
    })
        .then(function (response) {
            return fs.ensureDirAsync(_path.dirname(file))
                .then(function () {
                    return new Promise(function (resolve, reject) {
                        var stream = fs.createWriteStream(file);

                        var data = response.data;
                        data.pipe(stream);

                        data.on('data', function (data) {
                            console.log(sprintf('Transferring %d', data.length));
                        });

                        data.on('end', function () {
                            console.log(sprintf('Downloaded %s', url));
                            resolve();
                        });
                        data.on('error', function (err) {
                            reject(err);
                        });
                    });
                });
        })
};

/**
 *
 * @param url {string|string[]}
 * @returns {Promise.<string[]>}
 */
ScrapeUtil.retrieveLinks = function (url) {

    return ScrapeUtil.retrieve({
        url: url,
        callback: function (response, url) {
            var links = [];

            $ = cheerio.load(response.data);
            var linkElements = $('a');
            linkElements.each(function () {
                var linkUrl = $(this).attr('href');
                if (!_.isNil(linkUrl)) {
                    linkUrl = _url.resolve(url, linkUrl);
                    links.push(linkUrl);
                }
            });

            var scriptElements = $('script');
            scriptElements.each(function () {
                var scriptContent = $(this).text();

                const regex = /(\b(https?|ftp|file):\/\/[\-A-Z0-9+&@#\/%?=~_|!:,.;]*[\-A-Z0-9+&@#\/%=~_|])/ig;

                _.each(scriptContent.match(regex), function (link) {
                    links.push(link);
                });
            });


            return links;
        }
    });
};

/**
 *
 * @param url {string|string[]}
 * @returns {Promise.<string[]>}
 */
ScrapeUtil.retrieveScriptLinks = function (url) {
    return ScrapeUtil.retrieve({
        url: url, callback: function (response, url) {
            $ = cheerio.load(response.data);
            var scriptElements = $('script');
            var links = [];
            scriptElements.each(function () {
                var scriptContent = $(this).text();

                const regex = /(\b(https?|ftp|file):\/\/[\-A-Z0-9+&@#\/%?=~_|!:,.;]*[\-A-Z0-9+&@#\/%=~_|])/ig;

                _.each(scriptContent.match(regex), function (link) {
                    links.push(link);
                });
            });

            console.log(links);

            return links;
        }
    });

};

/**
 *
 * @param url {string|string[]}
 * @returns {Promise.<string[]>}
 */
ScrapeUtil.retrieveRedirectLinks = function (url) {
    return ScrapeUtil.retrieve({
        url: url, callback: function (response, url) {
            return _.get(response, 'headers.location');
        },
        requestOptions: {maxRedirects: 0}
    });
};

/**
 *
 * @param name
 * @param content
 * @returns {Promise<undefined>}
 */
ScrapeUtil.writeFileAsync = function (name, content) {
    var _name = Array.prototype.slice.call(arguments, 0, -1);
    var _content = Array.prototype.slice.call(arguments, -1);

    _name = _path.resolve.apply(null, _.concat(process.cwd(), _name));
    var parentDir = _path.dirname(_name);
    return fs.ensureDirAsync(parentDir)
        .then(function () {
            return fs.writeFileAsync(_name, _content);
        });
};


/**
 *
 * @param name
 * @param content
 * @returns {Promise<undefined>}
 */
ScrapeUtil.writeJsonAsync = function (name, content) {
    var args = Array.prototype.slice.call(arguments);
    var _name = args.slice(0, -1);
    var _content = _.last(args);

    _name = _path.resolve.apply(null, _.concat(process.cwd(), _name));
    var parentDir = _path.dirname(_name);
    return fs.ensureDirAsync(parentDir)
        .then(function () {
            return fs.writeFileAsync(_name, JSON.stringify(_content));
        });
};

ScrapeUtil.outputLinks = function (language, filename, content) {
    return ScrapeUtil.writeFileAsync('output', language, filename, content);
};

/**
 *
 * @param name
 * @returns {Promise<undefined>}
 */
ScrapeUtil.readJsonAsync = function (name) {
    var args = Array.prototype.slice.call(arguments);
    var _name = _path.resolve.apply(null, _.concat([process.cwd()], args));
    return fs.statAsync(_name)
        .catch(function () {
            return null;
        })
        .then(function (stats) {
            if (!_.isNil(stats)) {
                return fs.readFileAsync(_name)
                    .then(function (contents) {
                        var stringContents = contents.toString();
                        return JSON.parse(stringContents);
                    });
            }
            return null;
        })

};

/**
 *
 * @returns {Promise.<string[]>}
 * @param options
 */
ScrapeUtil.crawl = function crawl(options) {
    var links = _.get(options, 'links');
    var parseCallback = _.get(options, 'parseCallback');
    var filterCallback = _.get(options, 'filterCallback');
    var retrievedLinks = _.get(options, 'retrievedLinks', []);
    var visitedLinks = _.get(options, 'visitedLinks', []);


    function loop(links) {
        return ScrapeUtil.retrieveLinks(links)
            .then(function (newLinks) {
                _.each(links, function (link) {
                    visitedLinks.push(link);
                });

                var linksToCrawl;
                if (!_.isNil(parseCallback)) {
                    linksToCrawl = _.filter(newLinks, parseCallback);
                } else {
                    linksToCrawl = newLinks;
                }

                linksToCrawl = _.difference(linksToCrawl, visitedLinks);


                var filteredLinks;
                if (!_.isNil(filterCallback)) {
                    filteredLinks = _.filter(newLinks, filterCallback);
                } else {
                    filteredLinks = newLinks;
                }
                _.each(filteredLinks, function (link) {
                    retrievedLinks.push(link);
                });

                if (!_.isEmpty(linksToCrawl)) {
                    return loop(linksToCrawl);
                } else {
                    return retrievedLinks;
                }
            });
    }

    return loop(links);
};


ScrapeUtil.execute = function (promise) {
    return Promise.resolve(promise)
        .then(function () {
            process.exit(0);
        })
        .catch(function (err) {
            console.error(err.stack|err);
            process.exit(1);
        })
};


ScrapeUtil.hashFile = function (filePath) {
    var file = _path.resolve(process.cwd(), filePath);

    return new Promise(function (resolve, reject) {
        var stream = fs.createReadStream(file, {});

        var hash = crypto.createHash('sha256');
        stream.on('readable', function () {
            var data = stream.read();
            if (!_.isNil(data)) {
                hash.update(data);
            } else {
                resolve(hash.digest('hex'));
            }
        });
    });


};

ScrapeUtil.listTarballEntries = function (filePath) {

    var file = _path.resolve(process.cwd(), filePath);

    return new Promise(function (resolve, reject) {
        var stream = fs.createReadStream(file, {});
        var parse = targz().createParseStream();
        var entries = [];
        parse.on('entry', function (entry) {
            entries.push(entry);
        });

        parse.on('close', function () {
            resolve(entries);
        });

        parse.on('close', function () {
            resolve(entries);
        });

        stream.pipe(parse);
    });

};


ScrapeUtil.listZipEntries = function (filePath) {

    var file = _path.resolve(process.cwd(), filePath);

    return new Promise(function (resolve, reject) {
        try {
            var zip = new AdmZip(file);
            var zipEntries = zip.getEntries();
            resolve(zipEntries);
        } catch (err) {
            reject(err);
        }

    });

};

_.assign(ScrapeUtil, _.mapValues(_.omit(ScrapeUtil, ['hash', 'normalize']), function (fn) {
    return Promise.method(fn);
}));


module.exports = ScrapeUtil;