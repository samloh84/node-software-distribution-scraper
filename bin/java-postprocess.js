#!/usr/bin/env node


const _ = require('lodash');
const _path = require('path');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs-extra'));
const _url = require('url');
const ScrapeUtil = require('../lib/ScrapeUtil');
const YAML = require('yamljs');
const sprintf = require('sprintf-js').sprintf;

var language = /(\w+)-postprocess/.exec(_path.basename(__filename, '.js'))[1];
var workingDir = _path.resolve(process.cwd(), 'output', language);
var urls = require(_path.resolve(workingDir, sprintf('%s.json', language)));


var output = {urls: {}};

var versions = [];
var availableVersions = _.keys(urls.jdk);

var versionTree = {};

_.each(availableVersions, function (version) {
    var matches = /^(\d+)u(\d+)-b(\d+)$/.exec(version);

    if (!_.isNil(matches)) {
        var majorVersion = matches[1];
        var minorVersion = matches[2];
        var buildIdentifier = matches[3];

        if (_.isNil(versionTree[majorVersion])) {
            versionTree[majorVersion] = [];
        }
        versionTree[majorVersion].push(version);
    }

});

_.each(versionTree, function (majorVersionList, majorVersion) {
    majorVersionList.sort(function (a, b) {
        var aMatches = /^(\d+)u(\d+)-b(\d+)$/.exec(a);

        var aMinorVersion = parseInt(aMatches[2]);

        var bMatches = /^(\d+)u(\d+)-b(\d+)$/.exec(b);

        var bMinorVersion = parseInt(bMatches[2]);

        if (aMinorVersion < bMinorVersion) {
            return 1;
        } else if (aMinorVersion > bMinorVersion) {
            return -1;
        } else {
            return 0;
        }
    });

    if (majorVersion == 6) {
        //versions.push(_.first(majorVersionList));
    } else {
        versions = versions.concat(_.take(majorVersionList, 2));
    }

});


var promise = Promise.each(versions, function (version) {

    if (versions.indexOf(version) === -1) {
        return;
    }

    var versionUrls = _.get(urls, ['jdk', version]);

    var sourceUrl = _.get(versionUrls, ['linux-x64', 'tar.gz']) || _.get(versionUrls, ['linux-x64', 'bin']);
    var shasumUrl = _.get(versionUrls, ['shasum', 'txt']);
    var shasumSignatureUrl = _.get(versionUrls, ['shasum', 'txt.asc']);

    var fileName = _path.basename(_.get(_url.parse(sourceUrl), 'pathname'));

    var filePath = _path.resolve(workingDir, 'downloads', fileName);

    return fs.statAsync(filePath)
        .then(function () {
            return true;
        })
        .catch(function () {
            return false;
        })
        .then(function (fileExists) {
            if (!fileExists) {
                return ScrapeUtil.download({
                    url: sourceUrl,
                    file: filePath,
                    headers: {Cookie: 'oraclelicense=accept-securebackup-cookie'}
                });
            }
        })
        .then(function () {
            var dirPromise;
            if (filePath.endsWith('.tar.gz')) {
                dirPromise = ScrapeUtil.listTarballEntries(filePath)
                    .then(function (entries) {
                        return _.get(_.first(entries), 'path');
                    });
            } else {
                dirPromise = null;
            }

            return Promise.props({
                hash: ScrapeUtil.hashFile(filePath),
                dir: dirPromise
            });
        })
        .then(function (props) {
            var dir;
            if (!_.isNil(props.dir)) {
                dir = props.dir.replace(/\/$/, '');
            }
            var hash = props.hash.toUpperCase();

            var matches = /^(\d+)u(\d+)-b(\d+)$/.exec(version);
            var majorVersion = matches[1];
            var jceVersion = sprintf('jce%d', majorVersion);

            _.set(output, ['urls', 'jdk', version, 'tarball', 'file'], fileName);
            _.set(output, ['urls', 'jdk', version, 'tarball', 'dir'], dir);
            _.set(output, ['urls', 'jdk', version, 'tarball', 'url'], sourceUrl);
            _.set(output, ['urls', 'jdk', version, 'tarball', 'hash'], hash);
            _.set(output, ['urls', 'jdk', version, 'tarball', 'jce'], jceVersion);

            var jceUrl = urls.jce[majorVersion].zip;
            var jceFileName = _path.basename(_.get(_url.parse(jceUrl), 'pathname'));

            var jceFilePath = _path.resolve(workingDir, 'downloads', jceFileName);


            return fs.statAsync(jceFilePath)
                .then(function () {
                    return true;
                })
                .catch(function () {
                    return false;
                })
                .then(function (fileExists) {
                    if (!fileExists) {
                        return ScrapeUtil.download({
                            url: jceUrl,
                            file: jceFilePath,
                            headers: {Cookie: 'oraclelicense=accept-securebackup-cookie'}
                        });
                    }
                })
                .then(function () {
                    return Promise.props({
                        hash: ScrapeUtil.hashFile(jceFilePath),
                        dir: ScrapeUtil.listZipEntries(jceFilePath)
                            .then(function (entries) {
                                return _.get(_.first(entries), 'entryName');
                            })
                    });
                })
                .then(function (props) {

                    var dir;
                    if (!_.isNil(props.dir)) {
                        dir = props.dir.replace(/\/$/, '');
                    }
                    var hash = props.hash.toUpperCase();

                    _.set(output, ['urls', jceVersion, 'file'], fileName);
                    _.set(output, ['urls', jceVersion, 'dir'], dir);
                    _.set(output, ['urls', jceVersion, 'url'], sourceUrl);
                    _.set(output, ['urls', jceVersion, 'hash'], hash);
                });
        });
})

    .then(function () {
        return Promise.all([
            ScrapeUtil.outputLinks(language, sprintf('%s-vars.json', language), JSON.stringify(output, null, 4)),
            ScrapeUtil.outputLinks(language, sprintf('%s-vars.yml', language), YAML.stringify(output, 4))
        ]);
    });


return ScrapeUtil.execute(promise);
