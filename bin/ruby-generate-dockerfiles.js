#!/usr/bin/env node
const CliUtil = require('../lib/CliUtil');
const ScrapeUtil = require('../lib/ScrapeUtil');
const _path = require('path');
const _url = require('url');
const _ = require('lodash');
const sprintf = require('sprintf-js').sprintf;
const YAML = require('yamljs');
const Promise = require('bluebird');
const nunjucks = require('nunjucks');
const FileUtil = require('@lohsy84/common-utils').FileUtil;

var language = /(\w+)-generate-dockerfiles/.exec(_path.basename(__filename, '.js'))[1];
var workingDir = _path.resolve(process.cwd(), 'output', language);
var templateDir = _path.resolve(process.cwd(), 'templates');
var urls = require(_path.resolve(workingDir, sprintf('%s-vars.json', language))).urls;

var versions = _.keys(urls);

var additionalVersionTags = {
    "2.3.1": ["latest"]
};

var from = "centos:latest";
var maintainer = require(_path.resolve(process.cwd(), 'package.json')).author;
var username = _.get(process.env, 'DOCKER_USERNAME', 'samloh84');
var registry = _.get(process.env, 'DOCKER_REGISTRY', username);

var promise = Promise.map(_.toPairs(urls), function (versionPair) {
    var version = versionPair[0];
    var versionData = versionPair[1];

    var tags = [];

    var versionComponents = version.split('.');
    var i;
    var existingTags = [];
    for (i = 1; i < versionComponents.length; i++) {
        var tag = versionComponents.slice(0, i).join('.');
        if (tag !== '0' && existingTags.indexOf(tag) == -1) {
            tags.push(tag);
            existingTags.push(tag);
        }
    }

    tags = _.concat(tags, _.get(additionalVersionTags, version, []));

    var templateData = _.merge({}, versionData, {
        from: from,
        maintainer: maintainer,
        version: version,
        tags: tags,
        name: language,
        registry: registry,
        username: username

    });


    var customDockerfileTemplatePath = _path.resolve(templateDir, language, sprintf('Dockerfile-%s.njk', version));
    var dockerfileTemplatePath = _path.resolve(templateDir, language, 'Dockerfile.njk');
    var dockerfilePromise = FileUtil.exists({path: customDockerfileTemplatePath})
        .then(function (exists) {
            var dockerfileContents = nunjucks.render((exists ? customDockerfileTemplatePath : dockerfileTemplatePath), templateData);

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


return CliUtil.execute(promise);
