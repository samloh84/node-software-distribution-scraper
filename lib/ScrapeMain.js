const CliUtil = require('../lib/CliUtil');
const ScrapeUtil = require('../lib/ScrapeUtil');
const _path = require('path');
const _ = require('lodash');
const sprintf = require('sprintf-js').sprintf;
const YAML = require('yamljs');
const Promise = require('bluebird');
const nunjucks = require("nunjucks");

var ScrapeMain = {};


function scrapeLinks(options) {
    var language = _.get(options, 'language');
    var workingDirectory = _path.resolve(process.cwd(), 'output', language);


    var startingUrls = _.get(options, 'startingUrls');
    var parseCallback = _.get(options, 'parseCallback');
    var filterCallback = _.get(options, 'filterCallback');
    var patterns = _.get(options, 'patterns');

    return ScrapeUtil.crawl({
        url: startingUrls,
        parseCallback: parseCallback,
        filterCallback: filterCallback
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

                    var path = pattern.callback(matches);
                    _.set(urls, path, link);
                });

                if (unmatched) {
                    unmatchedLinks.push(link);
                }
            });

            links = links.join('\n');
            unmatchedLinks = unmatchedLinks.join('\n');


            var unmatchedLinksFilePath = _path.resolve(workingDirectory, 'unmatched_links.txt');
            var linksTextFilePath = _path.resolve(workingDirectory, 'links.txt');
            var linksJsonFilePath = _path.resolve(workingDirectory, sprintf('%s-links.json', language));
            var linksYamlFilePath = _path.resolve(workingDirectory, sprintf('%s-links.yml', language));
            var sortedLinksJson = JSON.stringify(urls, null, 4);
            var sortedLinksYaml = YAML.stringify(urls, 12);

            return Promise.all([
                ScrapeUtil.writeFile({
                    path: linksTextFilePath,
                    data: links
                }),
                ScrapeUtil.writeFile({
                    path: unmatchedLinksFilePath,
                    data: unmatchedLinks
                }),
                ScrapeUtil.writeFile({
                    path: linksJsonFilePath,
                    data: sortedLinksJson
                }),
                ScrapeUtil.writeFile({
                    path: linksYamlFilePath,
                    data: sortedLinksYaml
                })
            ]);
        });

}

ScrapeMain.scrapeLinks = Promise.method(scrapeLinks);


function downloadAndProcessLinks(options) {
    var language = _.get(options, 'language');
    var workingDir = _path.resolve(process.cwd(), 'output', language);
    var urls = require(_path.resolve(workingDir, sprintf('%s-links.json', language)));

    var output = {urls: {}};

    var versions = _.get(options, 'versions');

    var shortlistUrlsCallback = _.get(options, 'shortlistUrlsCallback');
    var downloadOptions = _.get(options, 'downloadOptions');
    var sortingCallback = _.get(options, 'sortingCallback');

    return Promise.resolve(shortlistUrlsCallback(urls))
        .then(function (shortlistedUrls) {
            shortlistedUrls = _.toPairs(shortlistedUrls);

            return Promise.map(shortlistedUrls, function (shortlistedUrlPair) {
                var version = shortlistedUrlPair[0];
                var versionUrlAttributes = shortlistedUrlPair[1];

                var url = versionUrlAttributes.url;
                var filename = versionUrlAttributes.filename;
                var filePath = _path.resolve(workingDir, 'downloads', version, filename);

                function retrieve(url) {
                    var _downloadOptions = _.merge({}, downloadOptions, {
                        url: url,
                        method: 'head'
                    });
                    return ScrapeUtil.retrieve(_downloadOptions)
                        .then(function (response) {
                            if (response.status === 301 || response.status === 302) {
                                return retrieve(response.headers.location);
                            }

                            var _downloadOptions = _.merge({}, downloadOptions, {
                                url: url,
                                savePath: filePath
                            });

                            return ScrapeUtil.download(_downloadOptions);
                        })
                }

                return retrieve(url)
                    .then(function () {
                        var dirPromise = null;

                        if (/(\.tar\.gz|\.tgz)$/.test(filename)) {
                            dirPromise = ScrapeUtil.listTarballEntries(filePath)
                                .then(function (entries) {
                                    var entry = _.first(entries);
                                    return _.get(entry, 'path');
                                })
                                .catch(function (err) {
                                    console.error(err.stack || err);
                                    return null;
                                });
                        } else if (/\.zip$/.test(filename)) {
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
                        if (!_.isNil(props.dir)) {
                            props.dir = props.dir.replace(/\/$/, '');
                        }
                        if (!_.isNil(props.hash)) {
                            props.hash = props.hash.toUpperCase()
                        }

                        var sortingInfo = sortingCallback(_.merge({}, versionUrlAttributes, props));
                        _.set(output, sortingInfo.path, _.omit(sortingInfo, 'path'));
                    });
            });
        });
}

ScrapeMain.downloadAndProcessLinks = Promise.method(downloadAndProcessLinks);

function generateDockerfiles(options) {

    var language = _.get(options, 'language');
    var workingDir = _path.resolve(process.cwd(), 'output', language);
    var templateDir = _path.resolve(process.cwd(), 'templates');
    var urls = require(_path.resolve(workingDir, sprintf('%s-downloads.json', language))).urls;

    var from = _.get(options, "centos:latest");
    var maintainer = require(_path.resolve(process.cwd(), 'package.json')).author;
    var username = _.get(process.env, 'DOCKER_USERNAME', 'samloh84');
    var registry = _.get(process.env, 'DOCKER_REGISTRY', username);
    var processUrlsCallback = _.get(options, 'processUrlsCallback');


    return Promise.resolve(processUrlsCallback(urls))
        .then(function (versions) {
            return Promise.map(_.toPairs(versions), function (versionPair) {
                var version = versionPair[0];
                var versionData = versionPair[1];

                var tags = _.get(versionData, 'tags', []);

                var templateData = _.merge({}, versionData, {
                    from: from,
                    maintainer: maintainer,
                    version: version,
                    tags: tags,
                    name: language,
                    registry: registry,
                    username: username
                });


                var languageTemplateDir = _path.resolve(templateDir, language);
                return FileUtil.ls({path: languageTemplateDir})
                    .then(function (files) {
                        var dockerfileTemplateFilename = 'Dockerfile.njk';

                        _.each(files, function (file) {
                            var matches = /^Dockerfile-(.+)\.njk$/.exec(file);
                            if (!_.isNil(matches)) {
                                var match = matches[1];
                                if (version.startsWith(match)) {
                                    dockerfileTemplateFilename = file;
                                    return false;
                                }
                            }
                        });

                        var dockerfileTemplatePath = _path.resolve(templateDir, language, dockerfileTemplateFilename);
                        var dockerfilePromise = Promise.resolve(nunjucks.render(dockerfileTemplatePath, templateData))
                            .then(function (dockerfileContents) {
                                return ScrapeUtil.writeFile({
                                    path: _path.resolve(workingDir, 'Dockerfiles', version, 'Dockerfile'),
                                    data: dockerfileContents
                                })
                            });

                        var makefileTemplatePath = _path.resolve(templateDir, 'Makefile.njk');

                        var makefilePromise = Promise.resolve(nunjucks.render(makefileTemplatePath, templateData))
                            .then(function (makefileContents) {
                                ScrapeUtil.writeFile({
                                    path: _path.resolve(workingDir, 'Dockerfiles', version, 'Makefile'),
                                    data: makefileContents
                                })
                            });

                        return Promise.all([
                            dockerfilePromise,
                            makefilePromise
                        ])
                    });
            })
                .then(function () {
                    var templateData = _.merge({}, {versions: versions});
                    var parentMakefileTemplatePath = _path.resolve(templateDir, 'ParentMakefile.njk');
                    var parentMakefileContents = nunjucks.render(parentMakefileTemplatePath, templateData);
                    return ScrapeUtil.writeFile({
                        path: _path.resolve(workingDir, 'Dockerfiles', 'Makefile'),
                        data: parentMakefileContents
                    })
                });

        });


}

ScrapeMain.generateDockerfiles = Promise.method(generateDockerfiles);

module.exports = ScrapeMain;
