const CliUtil = require('../lib/CliUtil');
const ScrapeUtil = require('../lib/ScrapeUtil');
const ScrapeMain = require('../lib/ScrapeMain');
const _path = require('path');
const _ = require('lodash');

var language = _path.basename(__filename, '.js');

var startingUrls = ['https://nodejs.org/dist/'];
var parseCallback = function (link) {
    return /^https?:\/\/nodejs.org\/dist\/.*\/$/.test(link) && !/docs?\//.test(link);
};

var filePattern = /^https?:\/\/nodejs.org\/dist\/v(\d+\.\d+\.\d+)\/node-v\d+\.\d+\.\d+(?:-([a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*))?(?:\.(7z|msi|pkg|tar\.gz|tar\.xz|zip))$/;
var shasumsPattern = /^https?:\/\/nodejs.org\/dist\/v(\d+\.\d+\.\d+)\/SHASUMS(?:256|-win)?(?:\.(txt|txt\.asc|txt\.gpg))$/;

var filePatternCallback = function (matches) {
    var version = matches[1];
    var distribution = matches[2];
    var extension = matches[3];

    if (_.isNil(distribution)) {
        if (extension == 'pkg') {
            distribution = 'macos';
        } else {
            distribution = 'source';
        }
    }

    return [version, distribution, extension];
};
var hashesPatternCallback = function (matches) {
    var version = matches[1];
    var extension = matches[2];
    var distribution = undefined;

    if (extension == 'txt') {
        distribution = 'hashes';
    } else if (extension == 'txt.asc') {
        distribution = 'hashes-signature';
    } else if (extension == 'txt.gpg') {
        distribution = 'hashes-gpg';
    }

    return [version, distribution, extension];
};

var patterns = [
    {pattern: filePattern, callback: filePatternCallback},
    {pattern: shasumsPattern, callback: hashesPatternCallback}
];


var promise = ScrapeMain.scrapeLinks({
    language: language,
    startingUrls: startingUrls,
    parseCallback: parseCallback,
    patterns: patterns
});

CliUtil.execute(promise);

