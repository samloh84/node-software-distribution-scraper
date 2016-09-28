#!/usr/bin/env node


const _ = require('lodash');
const _path = require('path');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs-extra'));
const ScrapeUtil = require('../lib/ScrapeUtil');
const YAML = require('yamljs');
const sprintf = require('sprintf-js').sprintf;

var startingUrls = ['https://www.python.org/ftp/python/'];

var language = _path.basename(__filename, '.js');


var filePattern = /^https?:\/\/www.python.org\/ftp\/python\/\d+\.\d+\.\d+\/[pP]ython-(\d+\.\d+\.\d+[a-zA-Z0-9]*)(?:[-\.]([a-zA-Z0-9]+(?:[-\.][a-zA-Z0-9]+)*))?(?:\.(dmg|exe|msi|pkg|rpm|tar\.bz2|tar\.gz|tar\.xz|tgz|zip))$/;
//var shasumsPattern = /^https?:\/\/nodejs.org\/dist\/(v\d+\.\d+\.\d+)\/SHASUMS(?:256|-win)?(?:\.(txt|txt\.asc|txt\.gpg))$/;


var filePatternCallback = function (matches) {
    var version = matches[1];
    var distribution = matches[2];
    var extension = matches[3];


    return {version: version, distribution: distribution, extension: extension};
};

var patterns = [
    [filePattern, filePatternCallback]
];

var promise = ScrapeUtil.crawl({
    links: startingUrls,
    parseCallback: function (link) {
        return /^https?:\/\/www.python.org\/ftp\/python\/.*\/$/.test(link) && !/docs?\//.test(link);
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
                    if (extension === 'dmg') {
                        distribution = 'macosx';
                    } else if (extension === 'msi') {
                        distribution = 'x86';
                    } else {
                        distribution = 'source';
                    }
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