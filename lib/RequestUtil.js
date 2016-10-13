const Promise = require('bluebird');
const axios = require('axios');
const _url = require('url');
const _path = require('path');
const _ = require('lodash');
const moment = require('moment');
var CommonUtils = require('@lohsy84/common-utils');
const FileUtil = CommonUtils.FileUtil;
const CryptoUtil = CommonUtils.CryptoUtil;
const StreamUtil = CommonUtils.StreamUtil;
const request = require('request');
const http = require('http');

var RequestUtil = {};

/**
 *
 * @param options {object}
 * @param options.url {string}
 * @param options.type {string}
 * @param options.buffer {boolean}
 * @param options.method {string}
 * @param options.cookies {Object.<string, string>}
 * @param options.headers {Object.<string, string>}
 * @param options.query {Object.<string, string>}
 * @param options.data {Object.<string, string>}
 * @param options.attachments {Object.<string, string|{path:string,filename:string}>}
 * @param options.redirects {number}
 * @param options.stream {string|Buffer|ReadStream}
 * @param options.auth {object}
 * @param options.auth.username {string}
 * @param options.auth.password {string}
 * @param options.auth.token {string}
 * @returns {Promise.<Response|object>}
 */
var sendRequest = function (options) {

    if (_.isString(options) || _.isArray(options)) {
        options = {url: options};
    }

    var url = _.get(options, 'url');
    var concurrency = _.get(options, 'concurrency', 10);

    if (_.isArray(url)) {
        return Promise.map(url, function (url) {
            return RequestUtil.sendRequest(_.merge({}, options, {url: url}));
        }, {concurrency: concurrency});
    }
    axios.defaults.headers.common['Content-Type'] = null;

    var agent = _.get(options, 'agent', 'Mozilla/5.0 (X11; Fedora; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.116 Safari/537.36');
    var type = _.get(options, 'type', null);
    var method = _.get(options, 'method', 'get');
    var cookies = _.get(options, 'cookies', {});
    var headers = _.get(options, 'headers', {});
    var query = _.get(options, 'query', {});
    var data = _.get(options, 'data', {});
    var buffer = _.get(options, 'buffer');
    var attachments = _.get(options, 'attachments', {});
    var redirects = _.get(options, 'redirects');
    var stream = _.get(options, 'stream');
    var outputStream = _.get(options, 'outputStream');
    var retries = _.get(options, 'retries', 0);
    var savePath = _.get(options, 'savePath');
    var cachePath = _.get(options, 'cachePath');
    var responseType = _.get(options, 'responseType', 'arraybuffer');
    var maxCacheTime = _.get(options, 'maxCacheTime', 10 * 60 * 1000);

    var username = _.get(options, 'auth.username') || _.get(options, 'username');
    var password = _.get(options, 'auth.password') || _.get(options, 'password');
    var token = _.get(options, 'auth.token') || _.get(options, 'token');
    var auth = !_.isEmpty(username) && !_.isEmpty(password) ? {username: password} : null;


    if (!_.isNil(token) && !_.isEmpty(token)) {
        _.set(headers, 'Authorization', sprintf('Bearer %s', token));
    }

    if (!_.isNil(type) && !_.isEmpty(type)) {
        _.set(headers, 'Content-Type', type);
    }

    if (!_.isNil(cookies) && !_.isEmpty(cookies)) {
        cookies = _.reduce(cookies, function (accumulator, value, key) {
            if (!_.isUndefined(value)) {
                accumulator.push(cookie.serialize(key, value));
            }
        }, []).join('; ');
        _.set(headers, 'Cookie', cookies);
    }

    _.set(headers, 'User-Agent', agent);

    _.set(headers, 'Accept','*/*');


    var cacheFilePath = null;
    if (!_.isNil(cachePath)) {
        var urlKey = _url.parse(url);
        delete urlKey['hash'];
        urlKey = _url.format(urlKey);
        urlKey = CryptoUtil.sha256(urlKey);

        cacheFilePath = _path.resolve(process.cwd(), cachePath, urlKey);
    }

    var streamPromise = null;
    if (!_.isNil(stream)) {
        if (_.isString(stream)) {
            streamPromise = FileUtil.createReadStream({path: stream});
        } else if (_.isBuffer(stream) || FileUtil.isReadStream(stream)) {
            streamPromise = Promise.resolve(stream);
        } else {
            return Promise.reject(new Error("Invalid parameter: stream"));
        }
    }

    var outputStreamPromise = null;
    if (!_.isNil(outputStream)) {
        if (FileUtil.isWriteStream(outputStream)) {
            responseType = 'stream';
            outputStreamPromise = Promise.resolve(outputStream);
        } else {
            return Promise.reject(new Error("Invalid parameter: outputStream"));
        }
    }

    var postSaveResponse = false;

    if (!_.isNil(savePath)) {
        savePath = _path.resolve(process.cwd(), savePath);

        buffer = true;

        outputStreamPromise = FileUtil.stat({path: savePath})
            .catch(function (err) {
                if (err.code == 'ENOENT') {
                    return null;
                } else {
                    throw err;
                }
            })
            .then(function (stats) {
                if (!_.isNil(stats) && stats.isDirectory()) {
                    postSaveResponse = true;
                } else {
                    var savePathParentDirectory = _path.dirname(savePath);
                    return FileUtil.mkdirp({path: savePathParentDirectory})
                        .then(function () {
                            responseType = 'stream';
                            return FileUtil.createWriteStream({path: savePath});
                        })
                }
            })
    }


    var saveResponse = Promise.method(function (response) {
        var filename = null;
        var contentDispositionHeader = _.get(response.header, 'content-disposition');
        if (!_.isEmpty(contentDispositionHeader)) {
            var filenameMatches = /filename="([^"]+)"/.exec(contentDispositionHeader);
            if (!_.isNil(filenameMatches)) {
                filename = filenameMatches[1];
            }
        }

        if (_.isNil(filename)) {
            filename = _url.parse(url);
            filename = filename.pathname;
            filename = _path.basename(filename);
        }

        savePath = _path.resolve(savePath, filename);

        return FileUtil.writeFile({path: savePath, data: response.data});
    });


    var retrieve = Promise.method(function () {
        return Promise.props({stream: streamPromise, outputStream: outputStreamPromise})
            .then(function (props) {
                var stream = props.stream;
                var outputStream = props.outputStream;

                var requestOptions = {
                    url: url,
                    method: method,
                    headers: headers,
                    params: query,
                    data: data,
                    auth: auth,
                    responseType: responseType,
                    maxContentLength: 2 * 1024 * 1024,
                    maxRedirects: redirects
                };

                return Promise.resolve(axios(requestOptions))
                    .catch(function (err) {
                        var response = _.get(err, 'response');
                        if (!_.isNil(response) && redirects >= 0 && (response.status == 301 || response.status == 302)) {
                            return response;
                        } else {
                            throw err;
                        }
                    })
                    .then(function (response) {
                        if (!_.isNil(outputStream)) {
                            return new Promise(function (resolve, reject) {
                                response.data.once('end', function () {
                                    resolve();
                                });

                                response.data.once('close', function () {
                                    resolve();
                                });

                                response.data.once('error', function (err) {
                                    reject(err);
                                });
                                outputStream.once('finish', function (err) {
                                    resolve();
                                });
                                outputStream.once('close', function (err) {
                                    resolve();
                                });

                                outputStream.once('error', function (err) {
                                    reject(err);
                                });

                                response.data.pipe(outputStream);
                            });
                        }

                        if (responseType !== 'stream') {
                            return StreamUtil.toBuffer(response.data)
                                .then(function (buffer) {
                                    response.data = buffer;

                                    if (responseType === 'text') {
                                        response.data = buffer.toString();
                                    } else if (responseType === 'json') {
                                        response.data = JSON.parse(buffer.toString());
                                    }


                                    return response;
                                })
                        }
                    })

            });
    });


    var retrieveCachedResponse = Promise.method(function () {
        if (!_.isNil(cacheFilePath)) {
            return FileUtil.exists({path: cacheFilePath})
                .then(function (fileExists) {
                    if (fileExists) {
                        return FileUtil.readFile({path: cacheFilePath})
                            .then(function (data) {
                                var cachedResponse = JSON.parse(data.toString());
                                var currentTimestamp = moment().valueOf();
                                var retrievedTimestamp = _.get(cachedResponse, 'timestamp');
                                var status = _.get(cachedResponse, 'status');
                                if (!_.isNil(status) && status === 200
                                    && !_.isNil(retrievedTimestamp) && currentTimestamp < (retrievedTimestamp + maxCacheTime)) {
                                    return cachedResponse;
                                }
                            })
                    }
                });
        }
    });

    var cacheResponse = Promise.method(function (response) {
        var cacheFileParentDirectory = _path.dirname(cacheFilePath);
        return FileUtil.mkdirp({path: cacheFileParentDirectory})
            .then(function () {
                var data = _.pick(response, ['data', 'headers', 'status', 'statusText']);

                data = _.merge({}, data, {timestamp: moment().valueOf()});
                return FileUtil.writeFile({path: cacheFilePath, data: JSON.stringify(data)});
            })

    });


    return retrieveCachedResponse()
        .then(function (cachedResponse) {
            if (!_.isNil(cachedResponse)) {
                return cachedResponse;
            }

            var numTries = 0;

            function loop() {
                return retrieve()
                    .catch(function (err) {
                        numTries++;
                        if ((numTries + 1) < retries) {
                            return loop();
                        } else {
                            throw err;
                        }
                    })
            }


            return loop()
                .tap(function (response) {
                    if (!_.isNil(cacheFilePath)) {
                        cacheResponse(response);
                    }

                    if (postSaveResponse) {
                        saveResponse(response);
                    }
                });
        });
};

RequestUtil.request = RequestUtil.sendRequest = Promise.method(sendRequest);

module.exports = RequestUtil;