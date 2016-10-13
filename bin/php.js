const CliUtil = require('../lib/CliUtil');
const ScrapeUtil = require('../lib/ScrapeUtil');
const _path = require('path');
const _ = require('lodash');
const sprintf = require('sprintf-js').sprintf;
const YAML = require('yamljs');
const Promise = require('bluebird');
var language = _path.basename(__filename, '.js');
var workingDirectory = _path.resolve(process.cwd(), 'output', language);


var startingUrls = ['http://php.net/releases/', 'https://secure.php.net/downloads.php', 'https://downloads.php.net/~davey/', 'http://museum.php.net/', 'http://windows.php.net/downloads/', 'http://windows.php.net/download'];

var parseCallback = function (link) {
    return (/^https?:\/\/\w+.php.net\/.*\/$/.test(link) || /^https?:\/\/\w+.php.net\/.*\/from\/a\/mirror$/.test(link)) && !/manual\//.test(link);
};


var filePattern1 = /^https?:\/\/php\.net\/get\/php-(\d+\.\d+\.\d+[a-zA-Z0-9]*)(?:\.(tar\.bz2|tar\.gz|tar\.xz))\/from\/this\/mirror$/;
var filePattern1Callback = function (matches) {
    var version = matches[1];
    //var distribution = matches[2];
    var extension = matches[2];

    return {version: version, extension: extension};
};

var filePattern2 = /^https?:\/\/museum\.php\.net\/(?:php\d+|win32)\/php-(\d+(?:\.\d+)?\.\d+[a-zA-Z0-9]*)(?:-([a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*))?(?:\.(tar\.bz2|tar\.gz|tar\.xz|zip|exe|msi))$/;

var filePattern2Callback = function (matches) {
    var version = matches[1];
    var distribution = matches[2];
    var extension = matches[3];

    if (_.isEmpty(distribution)) {
        distribution = 'source';
    }

    return {version: version, distribution: distribution, extension: extension};
};

var signaturePattern2 = /^https?:\/\/museum\.php\.net\/(?:php\d+|win32)\/php-(\d+(?:\.\d+)?\.\d+[a-zA-Z0-9]*)(?:-([a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*))?(?:\.(tar\.bz2|tar\.gz|tar\.xz|zip|exe|msi)).asc$/;

var signaturePattern2Callback = function (matches) {
    var version = matches[1];
    var distribution = matches[2];
    var extension = matches[3];

    if (_.isEmpty(distribution)) {
        distribution = 'signature';
    }

    return {version: version, distribution: distribution, extension: extension};
};

var filePattern3 = /^https?:\/\/downloads.php.net\/~davey\/php-(\d+\.\d+\.\d+[a-zA-Z0-9]*)(?:\.(tar\.bz2|tar\.gz|tar\.xz))$/;

var filePattern3Callback = function (matches) {
    var version = matches[1];
    var distribution = 'source';
    var extension = matches[2];

    return {version: version, distribution: distribution, extension: extension};
};

var signaturePattern3 = /^https?:\/\/downloads.php.net\/~davey\/php-(\d+\.\d+\.\d+[a-zA-Z0-9]*)(?:\.(tar\.bz2|tar\.gz|tar\.xz)).asc$/;

var signaturePattern3Callback = function (matches) {
    var version = matches[1];
    var distribution = matches[2];
    var extension = matches[3];

    if (_.isEmpty(distribution)) {
        distribution = 'signature';
    }

    return {version: version, distribution: distribution, extension: extension};
};

var patterns = [
    {pattern: filePattern1, callback: filePattern1Callback},
    {pattern: filePattern2, callback: filePattern2Callback},
    {pattern: signaturePattern2, callback: signaturePattern2Callback},
    {pattern: filePattern3, callback: filePattern3Callback},
    {pattern: signaturePattern3, callback: signaturePattern3Callback}

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

                if (_.isEmpty(distribution)) {
                    if (extension === 'pkg') {
                        distribution = 'macosx';
                    } else {
                        distribution = 'source';
                    }
                }
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


