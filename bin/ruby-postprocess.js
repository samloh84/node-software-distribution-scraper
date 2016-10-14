#!/usr/bin/env node
const CliUtil = require('../lib/CliUtil');
const ScrapeUtil = require('../lib/ScrapeUtil');
const _path = require('path');
const _url = require('url');
const _ = require('lodash');
const sprintf = require('sprintf-js').sprintf;
const YAML = require('yamljs');
const Promise = require('bluebird');

var language = /(\w+)-postprocess/.exec(_path.basename(__filename, '.js'))[1];
var workingDir = _path.resolve(process.cwd(), 'output', language);
var urls = require(_path.resolve(workingDir, sprintf('%s.json', language)));

var output = {urls: {}};

var versions = ['2.1.10', '2.2.5', '2.3.1'];

var availableVersions = _.keys(urls);
versions = _.intersection(versions, availableVersions);

var promise = Promise.map(versions, function (version) {

    if (versions.indexOf(version) === -1) {
        return;
    }

    var versionUrls = _.get(urls, version);

    var sourceUrl = _.get(versionUrls, ['source', 'tar.gz']);
    return Promise.all([
        processUrl({url: sourceUrl, version: version, distribution: 'source'})
    ])
})
    .then(function () {
        return Promise.all([
            ScrapeUtil.writeFile({
                path: _path.resolve(workingDir, sprintf('%s-vars.json', language)),
                data: JSON.stringify(output, null, 4)
            }),
            ScrapeUtil.writeFile({
                path: _path.resolve(workingDir, sprintf('%s-vars.yml', language)),
                data: YAML.stringify(output, 12)
            })
        ]);
    });


return CliUtil.execute(promise);

function processUrl(options) {
    var url = _.get(options, 'url');
    var distribution = _.get(options, 'distribution');
    var version = _.get(options, 'version');


    var fileName = _path.basename(_.get(_url.parse(url), 'pathname'));
    var filePath = _path.resolve(workingDir, 'downloads', version, fileName);

    return ScrapeUtil.download({savePath: filePath, url: url})
        .then(function () {
            var dirPromise = null;

            if (/(\.tar\.gz|\.tgz)$/.test(fileName)) {
                dirPromise = ScrapeUtil.listTarballEntries(filePath)
                    .then(function (entries) {
                        return _.get(_.first(entries), 'path');
                    })
                    .catch(function () {
                        return null;
                    });
            } else if (/\.zip$/.test(fileName)) {
                dirPromise = ScrapeUtil.listZipEntries(filePath)
                    .then(function (entries) {
                        return _.get(_.first(entries), 'entryName');
                    })
                    .catch(function () {
                        return null;
                    });
            }

            return Promise.props({
                hash: ScrapeUtil.hashFile(filePath),
                dir: dirPromise
            });
        })
        .then(function (props) {
            var dir = undefined;
            if (!_.isNil(props.dir)) {
                dir = props.dir.replace(/\/$/, '');
            }
            var hash = undefined;
            if (!_.isNil(props.hash)) {
                hash = props.hash.toUpperCase()
            }

            _.set(output, ['urls', version, distribution], {file: fileName, dir: dir, url: url, hash: hash});
        });
}
