#!/usr/bin/env node

const _ = require('lodash');
const retrieveLinks = require('../lib/scrape').retrieveLinks;
const retrieveScriptLinks = require('../lib/scrape').retrieveScriptLinks;
const fs = Promise.promisifyAll(require('fs-extra'));
const path = require('path');
const YAML = require('yamljs');

var startingUrls =
    [
        'http://www.oracle.com/technetwork/java/javase/archive-139210.html',
        'http://www.oracle.com/technetwork/java/javase/downloads/index.html'
    ];

var filename = path.basename(__filename).split('.');
var language = filename[filename.length - 2];

retrieveLinks(startingUrls)
    .then(function (links) {
        links.push('http://www.oracle.com/technetwork/java/javase/downloads/jce-7-download-432124.html');
        console.log(links.join('\n'));
        return links;
    })
    .tap(function (links) {
        return writeFileAsync('initial_links.txt', links.join('\n'));

    })
    .filter(function (link) {
        return /(javase|javasebusiness)\/downloads\/(jce|jdk|jre|jce|java-archive((-downloads)?-javase|-downloads-java-plat))/.test(link);
    })
    .tap(function (links) {
        console.log(links.join('\n'));
        return writeFileAsync('filtered_links.txt', links.join('\n'));
    })
    .then(function (links) {
        return retrieveScriptLinks(links);
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
            writeFileAsync('links.txt', links.join('\n')),
            writeFileAsync('unmatched_links.txt', unmatchedLinks.join('\n')),
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
