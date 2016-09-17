#!/usr/bin/env node

const _ = require('lodash');
const retrieveLinks = require('../lib/scrape').retrieveLinks;
const fs = Promise.promisifyAll(require('fs'));
const path = require('path');

var startingUrls = ['http://php.net/releases/', 'http://php.net/downloads.php'];

var filename = path.basename(__filename).split('.');
var language = filename[filename.length - 2];

retrieveLinks(startingUrls)
    .then(function (links) {
        links = _.map(links, function (link) {
            return link.replace(/\/a\/mirror/, '/this/mirror');
        });

        console.log(links.join('\n'));

        var releases = {};

        _.each(links, function (link) {
            var version, system, suffix;

            var versionMatches = /php-(\d+\.\d+\.\d+)(?:-(.+?))?\.((?:zip|exe|tar\.gz|tar\.xz|tar\.bz2)(?:\.asc)?)/i.exec(link);
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
            fs.writeFileAsync(path.resolve(process.cwd(), 'output', language, 'links.txt'), links.join('\n')),
            fs.writeFileAsync(path.resolve(process.cwd(), 'output', language, language + '.txt'), JSON.stringify(releases, null, 4))
        ]);

    });



