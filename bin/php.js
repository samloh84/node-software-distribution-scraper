#!/usr/bin/env node


const _ = require('lodash');
const _path = require('path');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs-extra'));
const ScrapeUtil = require('../lib/ScrapeUtil');
const YAML = require('yamljs');


var startingUrls = ['http://php.net/releases/', 'http://php.net/downloads.php'];

var language = _path.basename(__filename, '.js');

var promise = ScrapeUtil.retrieveLinks(startingUrls)
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
            ScrapeUtil.outputLinks(language, 'links.txt', links.join('\n')),
            ScrapeUtil.outputLinks(language, language + '.json', JSON.stringify(releases, null, 4)),
            ScrapeUtil.outputLinks(language, language + '.yml', YAML.stringify(releases, 4))
        ]);

    });


return ScrapeUtil.execute(promise);
