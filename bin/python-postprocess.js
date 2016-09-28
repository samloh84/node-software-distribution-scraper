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
var promise = ScrapeUtil.retrieve({
    url: 'https://raw.githubusercontent.com/docker-library/official-images/master/library/node',
    callback: function (response) {


        var matches;
        var regExp = /Tags:\s+(.+)/g;
        while (!_.isNil(matches = regExp.exec(response.data))) {
            var tags = matches[1];
            tags = tags.split(/,\s+/);

            _.each(tags, function (tag) {
                var matches = /(\d+\.\d+\.\d+[a-zA-Z0-9]*)/.exec(tag);
                if (!_.isNil(matches)) {
                    var version = matches[1];
                    versions.push(version);
                }
            });
        }

        versions = _.uniq(versions);
        versions.sort();

    }
})
    .then(function () {
        var availableVersions = _.keys(urls);
        versions = _.intersection(versions, availableVersions);

        return Promise.each(versions, function (version) {

            if (versions.indexOf(version) === -1) {
                return;
            }

            var versionUrls = _.get(urls, version);

            var sourceUrl = _.get(versionUrls, ['source', 'tgz']);
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
                        return ScrapeUtil.download({url: sourceUrl, file: filePath});
                    }
                })
                //return ScrapeUtil.download(sourceUrl, filePath)
                .then(function () {
                    return Promise.props({
                        hash: ScrapeUtil.hashFile(filePath),
                        dir: ScrapeUtil.listTarballEntries(filePath)
                            .then(function (entries) {
                                return _.get(_.first(entries), 'path');
                            })
                    });
                })
                .then(function (props) {
                    var dir = props.dir.replace(/\/$/, '');
                    var hash = props.hash.toUpperCase();
                    _.set(output, ['urls', version, 'source', 'file'], fileName);
                    _.set(output, ['urls', version, 'source', 'dir'], dir);
                    _.set(output, ['urls', version, 'source', 'url'], sourceUrl);
                    _.set(output, ['urls', version, 'source', 'hash'], hash);
                });
        })
    })
    .then(function () {
        return Promise.all([
            ScrapeUtil.outputLinks(language, sprintf('%s-vars.json', language), JSON.stringify(output, null, 4)),
            ScrapeUtil.outputLinks(language, sprintf('%s-vars.yml', language), YAML.stringify(output, 12))
        ]);
    });


return ScrapeUtil.execute(promise);
