#!/usr/bin/env node
const CliUtil = require('../lib/CliUtil');
const ScrapeUtil = require('../lib/ScrapeUtil');
const ScrapeMain = require('../lib/ScrapeMain');
const _path = require('path');
const _url = require('url');
const _ = require('lodash');
const sprintf = require('sprintf-js').sprintf;
const YAML = require('yamljs');
const Promise = require('bluebird');


var language = /(\w+)-postprocess/.exec(_path.basename(__filename, '.js'))[1];

var shortlistUrlsCallback = function (urls) {
    var versions = ['6.7.0', '5.12.0', '4.6.0', '0.12.16', '0.10.47'];
    var availableVersions = _.keys(urls);
    versions = _.intersection(versions, availableVersions);


    var shortlistedUrls = [];

    _.each(versions, function (version) {
        var hashesUrl = _.get(urls, [version, 'hashes', 'txt']);
        shortlistedUrls.push({url: hashesUrl, version: version, distribution: 'hashes'});

        var binariesUrl = _.get(urls, [version, 'linux-x64', 'tar.gz']);
        shortlistedUrls.push({url: binariesUrl, version: version, distribution: 'binaries'});

        var sourceUrl = _.get(urls, [version, 'source', 'tar.gz']);
        shortlistedUrls.push({url: sourceUrl, version: version, distribution: 'source'});

        var hashesSignatureUrl = _.get(urls, [version, 'hashes-signature', 'txt.asc']);
        shortlistedUrls.push({url: hashesSignatureUrl, version: version, distribution: 'signature'});
    });

    return shortlistedUrls;
};

var sortingCallback = function (data) {
    var path = [data.version, data.distribution];
    return {path: path, data: data};
};

var promise = ScrapeMain.downloadAndProcessLinks({
    language: language,
    shortlistUrlsCallback: shortlistUrlsCallback,
    sortingCallback: sortingCallback
});

return CliUtil.execute(promise);
