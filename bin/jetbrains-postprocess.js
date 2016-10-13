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

var products = ["CLion", "datagrip", "ideaIU", "pycharm-professional", "RubyMine", "PhpStorm", "WebStorm"];


var availableProducts = _.keys(urls);
products = _.intersection(products, availableProducts);

var promise = Promise.each(products, function (product) {

    if (products.indexOf(product) === -1) {
        return;
    }

    var productUrls = _.get(urls, product);
    var version = _.first(_.keys(productUrls));

    var binariesUrl = _.get(productUrls, [version, 'tar.gz']);

    return Promise.all([
        processUrl({
            url: binariesUrl,
            product: product,
            version: version,
            distribution: 'binaries'
        })
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
    var product = _.get(options, 'product');
    var version = _.get(options, 'version');
    var distribution = _.get(options, 'distribution');
    var additionalAttributes = _.get(options, 'attributes', {});


    var fileName = _path.basename(_.get(_url.parse(url), 'pathname'));
    var filePath = _path.resolve(workingDir, 'downloads', product, version, fileName);


    function retrieve(url) {
        return ScrapeUtil.retrieve({
            url: url,
            method: 'head'

        })
            .then(function (response) {
                if (response.status === 302) {
                    return retrieve(response.headers.location);
                }
                return ScrapeUtil.download({
                    savePath: filePath,
                    url: url

                });
            });


    }

    return retrieve(url)
        .then(function () {
            var dirPromise = null;

            if (/(\.tar\.gz|\.tgz)$/.test(fileName)) {
                dirPromise = ScrapeUtil.listTarballEntries(filePath)
                    .then(function (entries) {
                        var entry = _.first(entries);
                        return _.get(entry, 'path');
                    })
                    .catch(function (err) {
                        console.error(err.stack || err);
                        return null;
                    });
            } else if (/\.zip$/.test(fileName)) {
                dirPromise = ScrapeUtil.listZipEntries(filePath)
                    .then(function (entries) {
                        var entry = _.first(_.values(entries));
                        return _.get(entry, 'name');
                    })
                    .catch(function () {
                        console.error(err.stack || err);
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

            _.set(output, ['urls', product, version, distribution], _.merge({}, additionalAttributes, {
                file: fileName,
                dir: dir,
                url: url,
                hash: hash
            }));
        });
}