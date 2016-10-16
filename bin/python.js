const CliUtil = require('../lib/CliUtil');
const ScrapeUtil = require('../lib/ScrapeUtil');
const _path = require('path');
const _ = require('lodash');
const sprintf = require('sprintf-js').sprintf;
const YAML = require('yamljs');
const Promise = require('bluebird');
var language = _path.basename(__filename, '.js');
var workingDirectory = _path.resolve(process.cwd(), 'output', language);

var startingUrls = ['https://www.python.org/ftp/python/'];
var parseCallback = function (link) {
    return /^https?:\/\/www.python.org\/ftp\/python\/.*\/$/.test(link) && !/docs?\//.test(link);
};

var filePattern = /^https?:\/\/www.python.org\/ftp\/python\/(?:\d+\.\d+\.\d+)\/[pP]ython-(\d+\.\d+\.\d+[a-zA-Z0-9]*)(?:-([a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*))?(?:\.(tar\.xz|tar\.bz2|tgz|dmg|zip))$/;
var signaturePattern = /^https?:\/\/www.python.org\/ftp\/python\/(?:\d+\.\d+\.\d+)\/[pP]ython-(\d+\.\d+\.\d+[a-zA-Z0-9]*)(?:-([a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*))?(?:\.(tar\.xz|tar\.bz2|tgz|dmg|zip)).asc$/;

var filePatternCallback = function (matches) {
    var version = matches[1];
    var distribution = matches[2];
    var extension = matches[3];

    return {version: version, distribution: distribution, extension: extension};
};
var signaturePatternCallback = function (matches) {
    var version = matches[1];
    var distribution = matches[2];
    var extension = matches[3];

    return {version: version, distribution: distribution, extension: extension, signature: true};
};
var patterns = [
    {pattern: filePattern, callback: filePatternCallback},
    {pattern: signaturePattern, callback: signaturePatternCallback}
];


var promise = ScrapeUtil.crawl({
    url: startingUrls,
    parseCallback: parseCallback,
    filterCallback: null
})
    .then(function (links) {
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

                var version = linkInfo.version;
                var distribution = linkInfo.distribution;
                var extension = linkInfo.extension;
                var signature = linkInfo.signature;

                if (_.isEmpty(distribution)) {
                    if (extension === 'pkg') {
                        distribution = 'macosx';
                    } else {
                        distribution = 'source';
                    }
                }
                var path = [version, distribution, extension];

                if (signature){
                    path.push('signatureUrl');
                }else{
                    path.push('url');
                }

                _.set(urls, path, link);
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

