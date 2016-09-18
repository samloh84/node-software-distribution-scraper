#!/usr/bin/env node

const _ = require('lodash');
const retrieveLinks = require('../lib/scrape').retrieveLinks;
const fs = Promise.promisifyAll(require('fs-extra'));
const path = require('path');
const YAML = require('yamljs');

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
            writeFileAsync( 'links.txt', links.join('\n')),
            writeFileAsync(language + '.json', JSON.stringify(releases, null, 4)),
            writeFileAsync(language + '.yml', YAML.stringify(releases, 4))
        ]);

    });






function writeFileAsync(name, content) {
    var outputLanguagePath = path.resolve(process.cwd(), 'output', language);
    var outputFilePath = path.resolve(outputLanguagePath, name);
    return fs.ensureDirAsync(outputLanguagePath)
        .then(function () {
            return fs.writeFileAsync(outputFilePath, content);
        })
}
