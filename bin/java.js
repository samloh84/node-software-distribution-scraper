#!/usr/bin/env node


const _ = require('lodash');
const _path = require('path');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs-extra'));
const ScrapeUtil = require('../lib/ScrapeUtil');
const YAML = require('yamljs');

var startingUrls =
    [
        'http://www.oracle.com/technetwork/java/javase/archive-139210.html',
        'http://www.oracle.com/technetwork/java/javase/downloads/index.html'
    ];

var language = _path.basename(__filename, '.js');

var promise = ScrapeUtil.retrieveLinks(startingUrls)
    .then(function (links) {
        links.push('http://www.oracle.com/technetwork/java/javase/downloads/jce-7-download-432124.html');
        console.log(links.join('\n'));
        return links;
    })
    .tap(function (links) {
        return ScrapeUtil.outputLinks(language, 'initial_links.txt', links.join('\n'));

    })
    .filter(function (link) {
        return /(javase|javasebusiness)\/downloads\/(jce|jdk|jre|jce|java-archive((-downloads)?-javase|-downloads-java-plat))/.test(link);
    })
    .tap(function (links) {
        console.log(links.join('\n'));
        return ScrapeUtil.outputLinks(language, 'filtered_links.txt', links.join('\n'));
    })
    .then(function (links) {
        return ScrapeUtil.retrieveScriptLinks(links);
    })
    .then(function (links) {
        console.log(links.join('\n'));

        var releases = {};

        var unmatchedLinks = [];

        _.each(links, function (link) {
            var product, version, system, suffix;


            var matched;

            // http://download.oracle.com/otn-pub/java/jdk/7u55-b13/jdk-7u55-windows-x64.exe

            var patterns = [
                /java\/(?:jdk|jre|j2sdk)\/(.+?)\/(jdk|jre|j2sdk|j2re|server-jre|sjre)-(?:.+?)-(.+?)\.(bin|dmg|exe|rpm|sh|tar|tar\.gz|tar\.Z)$/,
                /java\/(?:j2sdk)\/(.+?)\/(jdk)(?:.+?)-(.+?)\.(bin|dmg|exe|rpm|sh|tar|tar\.gz|tar\.Z)$/,
                /java\/JS\/(j2SDK-(.+?))\/(j2sdk|j2re)-(?:.+?)-(.+?)\.(bin|dmg|exe|rpm|sh|tar|tar\.gz|tar\.Z)$/,
                /java\/JS\/(J2SDK-J2RE-(.+?))\/(jdk)-(?:.+?)-(.+?)\.(bin|dmg|exe|rpm|sh|tar|tar\.gz|tar\.Z)$/
            ];


            matched = _.some(patterns, function (pattern) {
                var matches = pattern.exec(link);
                if (matches) {

                    console.log(matches);

                    version = matches[1];
                    product = matches[2];
                    system = matches[3];
                    suffix = matches[4];

                    if (product === 'j2sdk') {
                        product = 'jdk';
                    } else if (product === 'j2re') {
                        product = 'jre';
                    } else if (product === 'sjre') {
                        product = 'server-jre';
                    }

                    link = link.replace(/\/otn\//, '/otn-pub/');

                    _.set(releases, [product, version, system, suffix], link);

                    return true;
                }

            });

            if (matched) {
                return;
            }


            unmatchedLinks.push(link);

        });


        return Promise.all([
            ScrapeUtil.outputLinks(language, 'links.txt', links.join('\n')),
            ScrapeUtil.outputLinks(language, 'unmatched_links.txt', unmatchedLinks.join('\n')),
            ScrapeUtil.outputLinks(language, language + '.json', JSON.stringify(releases, null, 4)),
            ScrapeUtil.outputLinks(language, language + '.yml', YAML.stringify(releases, 4))
        ]);
    });


return ScrapeUtil.execute(promise);

