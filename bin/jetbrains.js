const CliUtil = require('../lib/CliUtil');
const ScrapeUtil = require('../lib/ScrapeUtil');
const _path = require('path');
const _ = require('lodash');
const sprintf = require('sprintf-js').sprintf;
const YAML = require('yamljs');
const Promise = require('bluebird');
var language = _path.basename(__filename, '.js');
var workingDirectory = _path.resolve(process.cwd(), 'output', language);

var startingUrls = ['https://www.jetbrains.com/products.html'];
var parseCallback = function (link) {
    return /^https?:\/\/.*\.jetbrains.com\/.*\/download/.test(link)
        && !/documentation?\//.test(link);
};

var filePattern = /\w+\/([a-zA-Z0-9][-_.a-zA-Z0-9]*)-(\d+\.\d+\.\d+)(?:\.(dmg|exe|msi|zip|tar\.gz))$/;

var filePatternCallback = function (matches) {
    var product = matches[1];
    var version = matches[2];
    var extension = matches[3];

    return {product: product, version: version, extension: extension};
};
var patterns = [
    {pattern: filePattern, callback: filePatternCallback}
];


var promise = ScrapeUtil.retrieveLinks({url: startingUrls})
    .then(function (links) {
        links = links.filter(function (link) {
            return /download$/.test(link);
        });
        console.log(links);
        return ScrapeUtil.retrieveLinks({url: links, redirects:-1});
    })
    .then(function (links) {
        links = links.filter(function (link) {
            return /data\.services\.jetbrains\.com/.test(link);
        });
        console.log(links);
        return ScrapeUtil.retrieveRedirectLinks({url: links});
    })
    .tap(function (links) {
        console.log(links);
    })
    .then(function (links) {
        links = ScrapeUtil.normalizeLinks(links);

        var urls = {};
        var unmatchedLinks = [];

        _.each(links, function (link) {
            var unmatched = true;

            _.each(patterns, function (pattern) {

                var matches = pattern.pattern.exec(link);

                if (_.isNil(matches)) {
                    return true;
                }

                unmatched = false;

                var linkInfo = pattern.callback(matches);

                var product = linkInfo.product;
                var version = linkInfo.version;
                var extension = linkInfo.extension;

                _.set(urls, [product, version, extension], link);
            });

            if (unmatched) {
                unmatchedLinks.push(link);
            }
        });


        return Promise.all([
            ScrapeUtil.writeFile({path: _path.resolve(workingDirectory, 'links.txt'), data: links.join('\n')}),
            ScrapeUtil.writeFile({
                path: _path.resolve(workingDirectory, 'unmatched_links.txt'),
                data: unmatchedLinks.join('\n')
            }),
            ScrapeUtil.writeFile({
                path: _path.resolve(workingDirectory, sprintf('%s.json', language)),
                data: JSON.stringify(urls, null, 4)
            }),
            ScrapeUtil.writeFile({
                path: _path.resolve(workingDirectory, sprintf('%s.yml', language)),
                data: YAML.stringify(urls, 12)
            })
        ]);
    });


CliUtil.execute(promise);

