#!/usr/bin/env node


const _ = require('lodash');
const _path = require('path');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs-extra'));
const ScrapeUtil = require('../lib/ScrapeUtil');
const YAML = require('yamljs');


var startingUrls = ['https://iojs.org/dist/'];

var language = _path.basename(__filename, '.js');


var promise = ScrapeUtil.crawl({
    links: startingUrls,
    parseCallback: function (link) {
        return /^https?:\/\/iojs.org\/dist\/.*\/$/.test(link) && !/docs?\//.test(link);
    },
    filterCallback: null
})
    .then(function (links) {
        console.log(links.join('\n'));

        var releases = {};

        _.each(links, function (link) {
            var version, system, suffix;

            var versionMatches = /node-(v\d+\.\d+\.\d+(?:[^\-]+)?)(?:-(.*))?\.((?:msi|exe|zip|pkg|tar\.xz|tar\.gz|tgz)(?:\.asc)?)$/i.exec(link);
            if (versionMatches) {
                version = versionMatches[1];
                system = versionMatches[2];
                suffix = versionMatches[3];
                if (!system) {
                    if (suffix === 'pkg') {
                        system = 'macosx';
                    } else {
                        system = 'source';
                    }

                }
                _.set(releases, [version, system, suffix], link);
            }
        });


        return Promise.all([
            ScrapeUtil.outputLinks(language, 'links.txt', links.join('\n')),
            ScrapeUtil.outputLinks(language, language + '.json', JSON.stringify(releases, null, 4)),
            ScrapeUtil.outputLinks(language, language + '.yml', YAML.stringify(releases, 4))
        ]);


    });

return ScrapeUtil.execute(promise);