const CliUtil = require('../lib/CliUtil');
const ScrapeUtil = require('../lib/ScrapeUtil');
const _path = require('path');
const _ = require('lodash');
const sprintf = require('sprintf-js').sprintf;
const YAML = require('yamljs');


var language = _path.basename(__filename, '.js');

var workingDirectory = _path.resolve(process.cwd(), 'output', language);

var startingUrls = ['http://www.eclipse.org/jetty/download.html'];

var parseCallback = function (link) {
    return /^https?:\/\/download\.eclipse\.org\/jetty\/updates\/jetty-bundles-\d+\.x$/.test(link);
};

var filePattern = /^https?:\/\/repo1\.maven\.org\/maven2\/org\/eclipse\/jetty\/jetty-distribution\/(\d+\.\d+\.\d+\.v\d+)\/jetty-distribution-\d+\.\d+\.\d+\.v\d+(?:\.(tar\.gz|zip))$/;
//var shasumsPattern = /^https?:\/\/nodejs.org\/dist\/v(\d+\.\d+\.\d+)\/SHASUMS(?:256|-win)?(?:\.(txt|txt\.asc|txt\.gpg))$/;


var filePatternCallback = function (matches) {
    var version = matches[1];
    var distribution = 'binaries';
    var extension = matches[2];

    return {version: version, distribution: distribution, extension: extension};
};
// var shasumsPatternCallback = function (matches) {
//     var version = matches[1];
//     var distribution = 'shasum';
//     var extension = matches[2];
//
//     return {version: version, distribution: distribution, extension: extension};
// };
var patterns = [
    {pattern: filePattern, callback: filePatternCallback}
    // {pattern: shasumsPattern, callback: shasumsPatternCallback}
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

                _.set(urls, [version, distribution, extension], link);
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

