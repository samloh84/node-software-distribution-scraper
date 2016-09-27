#!/usr/bin/env node

const _ = require('lodash');
const _path = require('path');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs-extra'));
const ScrapeUtil = require('../lib/ScrapeUtil');
const YAML = require('yamljs');
const sprintf = require('sprintf-js').sprintf;

var startingUrls = ['http://www.oracle.com/technetwork/java/javase/archive-139210.html',
    'http://www.oracle.com/technetwork/java/javase/downloads/index.html',
    'http://www.oracle.com/technetwork/java/javase/downloads/jce-7-download-432124.html'];

var language = _path.basename(__filename, '.js');


var filePattern1 = /https?:\/\/download\.oracle\.com\/otn(?:-pub)?\/java\/(?:[^\/]+)\/([^\/]+)\/([a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*)-(?:\d+(?:_\d+)*|\d+u\d+)-([a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*)(?:\.(rpm|tar\.Z|zip|tar\.gz|exe|dmg|bin|sh))/;

var filePattern1Callback = function (matches) {
    var version = matches[1];
    var product = matches[2];
    var distribution = matches[3];
    var extension = matches[4];

    return {product: product, version: version, distribution: distribution, extension: extension};
};


var filePattern2 = /https?:\/\/download\.oracle\.com\/otn(?:-pub)?\/java\/(jce(?:_policy)?)\/([^\/]+)\/[-_a-zA-Z0-9]+(?:\.(zip))/;

var filePattern2Callback = function (matches) {
    var product = matches[1];
    var version = matches[2];
    var extension = matches[3];

    return {product: product, version: version, extension: extension};
};


var patterns = [
    [filePattern1, filePattern1Callback],
    [filePattern2, filePattern2Callback]
];

var promise = ScrapeUtil.crawl({
    links: startingUrls,
    parseCallback: function (link) {
        return /^https?:\/\/www\.oracle\.com\/technetwork\/java\/(?:javase|javasebusiness|javaee)?\/downloads\//.test(link);
    },
    filterCallback: null
})
    .then(function (links) {
        var urls = {};
        var unmatchedLinks = [];

        _.each(links, function (link) {

            link = link.replace(/\/otn\//, '/otn-pub/');

            var unmatched = true;

            _.each(patterns, function (pattern) {

                var matches = pattern[0].exec(link);

                if (_.isNil(matches)) {
                    return true;
                }

                unmatched = false;

                var linkInfo = pattern[1](matches);

                var product = linkInfo.product;
                var version = linkInfo.version;
                var distribution = linkInfo.distribution;
                var extension = linkInfo.extension;


                if (product == 'j2sdk') {
                    product = 'jdk';
                } else if (product == 'j2re') {
                    product = 'jre';
                } else if (product === 'jce_policy') {
                    product = 'jce';
                }


                if (product === 'jce') {
                    _.setWith(urls, [product, version, extension], link, Object);
                } else {
                    _.setWith(urls, [product, version, distribution, extension], link, Object);
                }


            });

            if (unmatched) {
                unmatchedLinks.push(link);
            }
        });


        return Promise.all([
            ScrapeUtil.outputLinks(language, 'links.txt', links.join('\n')),
            ScrapeUtil.outputLinks(language, 'unmatched_links.txt', unmatchedLinks.join('\n')),
            ScrapeUtil.outputLinks(language, language + '.json', JSON.stringify(urls, null, 4)),
            ScrapeUtil.outputLinks(language, language + '.yml', YAML.stringify(urls, 4))
        ]);
    });

return ScrapeUtil.execute(promise);
