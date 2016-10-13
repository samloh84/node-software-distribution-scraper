const RequestUtil = require('@lohsy84/request-util');
const axios = require('axios');
const cheerio = require('cheerio');
const _ = require('lodash');
const _url = require('url');
const _path = require('path');
const Promise = require('bluebird');
const CommonUtils = require('@lohsy84/common-utils');
const FileUtil = CommonUtils.FileUtil;
const CryptoUtil = CommonUtils.CryptoUtil;
const targz = require('tar.gz');
const StreamZip = require('node-stream-zip');
const sprintf = require('sprintf-js').sprintf;

var ScrapeUtil = {};

ScrapeUtil.urlRegex = /(\b(https?|ftp|file):\/\/[\-A-Z0-9+&@#\/%?=~_|!:,.;]*[\-A-Z0-9+&@#\/%=~_|])/ig;


ScrapeUtil.normalizeLinks = function (links) {
    links = _.flatten(links);

    links = _.map(links, function (link) {
        var parsedUrl = _url.parse(link);
        delete parsedUrl['hash'];
        return _url.format(parsedUrl);
    });

    links = _.filter(links, function (link) {
        return !_.isNil(link)
    });

    links = _.uniq(links);

    links.sort();

    return links;
};

ScrapeUtil.download = function (options) {
    var url = _.get(options, 'url');

    if (_.isPlainObject(url)) {
        var concurrency = _.get(options, 'concurrency');

        var urlSavePathPairs = _.toPairs(url);

        return Promise.map(urlSavePathPairs, function (urlSavePathPair) {
            var url = urlSavePathPair[0];
            var savePath = urlSavePathPair[1];
            var retrieveOptions = _.merge({}, options, {url: url, savePath: savePath});
            return ScrapeUtil.download(retrieveOptions);
        });
    }

    var savePath = _.get(options, 'savePath');
    savePath = _path.resolve(process.cwd(), savePath);
    var parentPath = _path.dirname(savePath);

    console.log('Downloading URL ' + url);
    return FileUtil.mkdirp({path: parentPath})
        .catch(function (err) {
            if (error.code !== 'EEXIST') {
                throw err;
            }
        })
        .then(function () {
            return FileUtil.stat({path: savePath})
        })
        .then(function (stats) {
            return true;
        })
        .catch(function (err) {
            return false;
        })
        .then(function (exists) {
            //if (!exists) {
            var retrieveOptions = _.merge({}, options, {url: url, savePath: savePath});
            return RequestUtil.sendRequest(retrieveOptions);
            //}
        })
        .tap(function () {
            console.log('Downloaded URL ' + url + ' to ' + savePath);
        });
};

ScrapeUtil.retrieve = function (options) {

    var url = _.get(options, 'url');

    if (_.isArray(url)) {
        var concurrency = _.get(options, 'concurrency');

        url = ScrapeUtil.normalizeLinks(url);
        return Promise.map(url, function (url) {
            var retrieveOptions = _.merge({}, options, {url: url});
            return ScrapeUtil.retrieve(retrieveOptions);
        });
    }

    var callback = _.get(options, 'callback');

    console.log('Retrieving URL ' + url);

    var sendRequestOptions = _.merge({}, options, {url: url, cachePath: 'cache'});
    return RequestUtil.sendRequest(sendRequestOptions)
        .then(function (response) {
            console.log('Retrieved URL ' + url);

            if (!_.isNil(callback)) {
                return Promise.resolve(callback(response, url));
            } else {
                return response;
            }
        })
        .catch(function (err) {
            console.error(sprintf("Could not retrieve URL: %s, %s", url, err.stack || err));
        });
};


ScrapeUtil.retrieveLinks = function (options) {
    var links = [];
    var callback = function (response, url) {
        var $ = cheerio.load(response.text);
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
            var matches = scriptContent.match(ScrapeUtil.urlRegex);
            _.each(matches, function (link) {
                links.push(link);
            });
        });


        var noscriptElements = $('noscript');
        noscriptElements.each(function () {
            var noscriptContent = $(this).text();
            var matches = noscriptContent.match(ScrapeUtil.urlRegex);
            _.each(matches, function (link) {
                links.push(link);
            });
        });
    };

    var retrieveOptions = _.merge({}, options, {callback: callback});
    return ScrapeUtil.retrieve(retrieveOptions)
        .then(function () {
            return ScrapeUtil.normalizeLinks(links);
        });
};

ScrapeUtil.retrieveRedirectLinks = function (options) {


    var url = _.get(options, 'url');
    var links = [];


    var callback = function (response, url) {
        var link = _.get(response, 'headers.location');
        link = _url.resolve(url, link);
        links.push(link);
    };

    var retrieveOptions = _.merge({}, options, {
        url: url,
        callback: callback,
        redirects: 0
    });
    return ScrapeUtil.retrieve(retrieveOptions)
        .then(function () {
            return ScrapeUtil.normalizeLinks(links);
        });
};


ScrapeUtil.crawl = function (options) {

    var url = _.get(options, 'url');
    var parseCallback = _.get(options, 'parseCallback');
    var filterCallback = _.get(options, 'filterCallback');
    var retrievedLinks = _.get(options, 'retrievedLinks', []);
    var visitedLinks = _.get(options, 'visitedLinks', []);

    var loop = function (links) {
        return ScrapeUtil.retrieveLinks(_.merge({}, options, {url: links}))
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
            })
    };

    return loop(url);
};


ScrapeUtil.writeFile = function (options) {
    var path = _.get(options, 'path');
    path = _path.resolve(process.cwd(), path);
    var parentPath = _path.dirname(path);

    return FileUtil.mkdirp({path: parentPath})
        .catch(function (err) {
            if (err.code !== 'EEXIST') {
                throw err;
            }
        })
        .then(function () {
            return FileUtil.writeFile(_.merge({}, options, {path: path}));
        });
};

//
// ScrapeUtil.sortVersionNumbers = function (versions) {
//     versions.sort(function (a, b) {
//         var aVersionComponents = a.split('.');
//         var bVersionComponents = b.split('.');
//
//         var i;
//         for (i = 0; i < aVersionComponents.length && i < bVersionComponents.length; i++) {
//             var aVersionComponent = aVersionComponents[i];
//             var bVersionComponent = bVersionComponents[i];
//
//             if (/^\d+$/.test(aVersionComponents[i]) && /^\d+$/.test(bVersionComponents[i])) {
//                 aVersionComponent = _.toInteger(aVersionComponent);
//                 bVersionComponent = _.toInteger(bVersionComponent);
//
//                 if (aVersionComponent > bVersionComponent) {
//                     return -1;
//                 } else if (aVersionComponent < bVersionComponent) {
//                     return 1;
//                 }
//             }else {
//
//             }
//         }
//
//         return 0;
//     })
//
// };
ScrapeUtil.hashFile = function (filePath) {
    return FileUtil.readFile({path: filePath})
        .then(function (stream) {
            return CryptoUtil.hash({data: stream});
        });
};

ScrapeUtil.listTarballEntries = function (filePath) {

    var file = _path.resolve(process.cwd(), filePath);

    return FileUtil.createReadStream({path: file})
        .then(function (stream) {
            return new Promise(function (resolve, reject) {
                try {
                    var parse = targz().createParseStream();
                    var entries = [];
                    parse.on('entry', function (entry) {
                        entries.push(entry);
                    });

                    parse.on('close', function () {
                        resolve(entries);
                    });

                    parse.on('error', function (err) {
                        reject(err);
                    });

                    stream.pipe(parse);
                } catch (err) {
                    reject(err);
                }

            });
        })
        .catch(function (err) {
            console.error(err.stack || err);
            return null;
        })


};


ScrapeUtil.listZipEntries = function (filePath) {

    var file = _path.resolve(process.cwd(), filePath);

    return new Promise(function (resolve, reject) {
        try {
            var zip = new StreamZip({
                file: file,
                storeEntries: true
            });

            zip.on('error', function (err) {
                reject(err);
            });

            zip.on('ready', function () {
                var zipEntries = zip.entries();
                resolve(zipEntries);
            });
        } catch (err) {
            reject(err);
        }

    })
        .catch(function (err) {
            console.error(err.stack || err);
            return null;
        });

};
module.exports = ScrapeUtil;