#!/usr/bin/env node

const _ = require('lodash');
const retrieveLinks = require('../lib/scrape').retrieveLinks;
const fs = Promise.promisifyAll(require('fs'));
const path = require('path');

var startingUrls = ['https://www.python.org/ftp/python/'];

var filename = path.basename(__filename).split('.');
var language = filename[filename.length - 2];

retrieveLinks(startingUrls)
    .filter(function (link) {
        return /(\d+\.\d+\.\d+)\//.test(link)
    })
    .then(function (links) {
        return retrieveLinks(links);
    })
    .then(function (links) {
        console.log(links.join('\n'));

        var releases = {};

        _.each(links, function (link) {
            var version, system, suffix;

            var versionMatches = /python-(\d+\.\d+\.\d+(?:[^\-]+)?)(?:-(.*))?\.((?:exe|zip|pkg|tar\.xz|tgz)(?:\.asc)?)$/i.exec(link);
            if (versionMatches) {
                version = versionMatches[1];
                system = versionMatches[2];
                suffix = versionMatches[3];
                if (!system) {
                    if (suffix === 'exe' || suffix === 'exe.asc') {
                        system = 'i686';
                    } else {
                        system = 'source';
                    }

                }
                _.set(releases, [version, system, suffix], link);
            }
        });

        return Promise.all([
            fs.writeFileAsync(path.resolve(process.cwd(), 'output', language, 'links.txt'), links.join('\n')),
            fs.writeFileAsync(path.resolve(process.cwd(), 'output', language, language + '.txt'), JSON.stringify(releases, null, 4))
        ]);

    });
