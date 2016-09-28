#!/usr/bin/env node


const _ = require('lodash');
const _path = require('path');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs-extra'));
const ScrapeUtil = require('../lib/ScrapeUtil');
const YAML = require('yamljs');
const sprintf = require('sprintf-js').sprintf;


var startingUrls = ['http://php.net/releases/', 'http://php.net/downloads.php', 'https://downloads.php.net/~davey/', 'http://museum.php.net/'];

var language = _path.basename(__filename, '.js');

var filePattern1 = /^https?:\/\/php\.net\/get\/php-(\d+\.\d+\.\d+[a-zA-Z0-9]*)(?:\.(tar\.bz2|tar\.gz|tar\.xz))\/from\/this\/mirror/;


var filePattern1Callback = function (matches) {
    var version = matches[1];
    //var distribution = matches[2];
    var extension = matches[2];

    return {version: version, distribution: distribution, extension: extension};
};

var filePattern2 = /^https?:\/\/museum\.php\.net\/(?:php\d+|win32)\/php-(\d+(?:\.\d+)?\.\d+[a-zA-Z0-9]*)(?:-([a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*))?(?:\.(tar\.bz2|tar\.gz|tar\.xz|zip|exe|msi))/;

var filePattern2Callback = function (matches) {
    var version = matches[1];
    var distribution = matches[2];
    var extension = matches[3];

    if (_.isEmpty(distribution)) {
        distribution = 'source';
    }

    return {version: version, distribution: distribution, extension: extension};
};

var filePattern3 = /^https?:\/\/downloads.php.net\/~davey\/php-(\d+\.\d+\.\d+[a-zA-Z0-9]*)(?:\.(tar\.bz2|tar\.gz|tar\.xz))/;

var filePattern3Callback = function (matches) {
    var version = matches[1];
    var distribution = matches[2];
    var extension = matches[3];

    if (_.isEmpty(distribution)) {
        distribution = 'source';
    }

    return {version: version, distribution: distribution, extension: extension};
};

//var shasumsPattern = /^https?:\/\/nodejs.org\/dist\/v(\d+\.\d+\.\d+)\/SHASUMS(?:256|-win)?(?:\.(txt|txt\.asc|txt\.gpg))$/;


var patterns = [
    [filePattern1, filePattern1Callback],
    [filePattern2, filePattern2Callback],
    [filePattern3, filePattern3Callback]
];

var promise = ScrapeUtil.crawl({
    links: startingUrls,
    parseCallback: function (link) {
        return /^https?:\/\/museum.php.net\/.*\/$/.test(link) && !/docs?\//.test(link);
    },
    filterCallback: null
})
    .then(function (links) {
        var urls = {};
        var unmatchedLinks = [];

        _.each(links, function (link) {
            var unmatched = true;

            _.each(patterns, function (pattern) {

                var matches = pattern[0].exec(link);

                if (_.isNil(matches)) {
                    return true;
                }

                unmatched = false;

                var linkInfo = pattern[1](matches);

                var version = linkInfo.version;
                var distribution = linkInfo.distribution;
                var extension = linkInfo.extension;

                if (_.isEmpty(distribution)) {
                    distribution = 'source';
                }
                _.set(urls, [version, distribution, extension], link);
            });

            if (unmatched) {
                unmatchedLinks.push(link);
            }
        });


        return Promise.all([
            ScrapeUtil.outputLinks(language, 'links.txt', links.join('\n')),
            ScrapeUtil.outputLinks(language, 'unmatched_links.txt', unmatchedLinks.join('\n')),
            ScrapeUtil.outputLinks(language, language + '.json', JSON.stringify(urls, null, 4)),
            ScrapeUtil.outputLinks(language, language + '.yml', YAML.stringify(urls, 12))
        ]);
    });

return ScrapeUtil.execute(promise);
