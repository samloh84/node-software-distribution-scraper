const CliUtil = require('../lib/CliUtil');
const ScrapeUtil = require('../lib/ScrapeUtil');
const _path = require('path');
const _ = require('lodash');
const sprintf = require('sprintf-js').sprintf;
const YAML = require('yamljs');
const Promise = require('bluebird');
var language = _path.basename(__filename, '.js');
var workingDirectory = _path.resolve(process.cwd(), 'output', language);


var startingUrls = ['http://php.net/releases/',
    'https://secure.php.net/downloads.php',
    'https://downloads.php.net/~davey/',
    // 'http://museum.php.net/',
    // 'http://windows.php.net/downloads/',
    // 'http://windows.php.net/download'
];

var parseCallback = function (link) {
    return (/^https?:\/\/secure.php.net\/.*\/$/.test(link)
            || /^https?:\/\/secure.php.net\/.*\/from\/a\/mirror$/.test(link)
        ) && !/manual\//.test(link);
};


var filePattern1 = /^https?:\/\/php\.net\/get\/php-(\d+\.\d+\.\d+[a-zA-Z0-9]*)(?:\.(tar\.bz2|tar\.gz|tar\.xz))\/from\/this\/mirror$/;
var filePattern1Callback = function (matches) {
    var version = matches[1];
    //var distribution = matches[2];
    var extension = matches[2];

    return {version: version, extension: extension};
};

var signaturePattern1 = /^https?:\/\/php\.net\/get\/php-(\d+\.\d+\.\d+[a-zA-Z0-9]*)(?:\.(tar\.bz2|tar\.gz|tar\.xz).asc)\/from\/this\/mirror$/;
var signaturePattern1Callback = function (matches) {
    var version = matches[1];
    //var distribution = matches[2];
    var extension = matches[2];

    return {version: version, extension: extension, signature: true};
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
        distribution = 'source';
    }

    return {version: version, distribution: distribution, extension: extension, signature: true};
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
    var distribution = 'source';
    var extension = matches[2];

    return {version: version, distribution: distribution, extension: extension, signature: true};
};

var patterns = [
    {pattern: filePattern1, callback: filePattern1Callback},
    {pattern: signaturePattern1, callback: signaturePattern1Callback},
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
        var signatureLinks = [];
        _.each(links, function (link) {
            var regex = /^https?:\/\/php\.net\/get\/(php-(?:\d+\.\d+\.\d+[a-zA-Z0-9]*)(?:\.(?:tar\.bz2|tar\.gz|tar\.xz)))\/from\/this\/mirror$/;
            var matches = regex.exec(link);
            if (!_.isNil(matches)) {
                var filename = matches[1];
                var offset = link.indexOf(filename);
                link = link.slice(0, offset) + filename + '.asc' + link.slice(offset + filename.length);

                signatureLinks.push(link);
            }
        });

        links = _.concat(links, signatureLinks);

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

                if (signature) {
                    path.push('signatureUrl');
                } else {
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


