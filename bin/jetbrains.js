#!/usr/bin/env node


const _ = require('lodash');
const _path = require('path');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs-extra'));
const ScrapeUtil = require('../lib/ScrapeUtil');
const YAML = require('yamljs');


var startingUrls = ['https://www.jetbrains.com/products.html'];

var language = _path.basename(__filename, '.js');

var promise = ScrapeUtil.retrieveLinks(startingUrls)
    .filter(function (link) {
        return /download$/.test(link);
    })
    .then(function (links) {
        console.log(links);
        return ScrapeUtil.retrieveLinks(links);
    })
    .tap(function (links) {
        console.log(links);
    })
    .filter(function (link) {
        return /data\.services\.jetbrains\.com/.test(link);
    })
    .then(function (links) {
        console.log(links);
        return ScrapeUtil.retrieveRedirectLinks(links);
    })
    .tap(function (links) {
        console.log(links);
    })
    .then(function (links) {
        console.log(links.join('\n'));

        var releases = {};
        _.each(links, function (link) {
            var version, product, suffix;

            var versionMatches = /\w+\/(\w+)-(\d+\.\d+\.\d+)\.((?:msi|exe|zip|pkg|tar\.xz|tar\.gz|tgz)(?:\.asc)?)$/i.exec(link);
            if (versionMatches) {
                product = versionMatches[1];
                version = versionMatches[2];
                suffix = versionMatches[3];

                _.set(releases, [product, version, suffix], link);
            }
        });


        return Promise.all([
            ScrapeUtil.outputLinks(language, 'links.txt', links.join('\n')),
            ScrapeUtil.outputLinks(language, language + '.json', JSON.stringify(releases, null, 4)),
            ScrapeUtil.outputLinks(language, language + '.yml', YAML.stringify(releases, 4))
        ]);


    });


return ScrapeUtil.execute(promise);