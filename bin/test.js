#!/usr/bin/env node


const _ = require('lodash');
const _path = require('path');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs-extra'));
const _url = require('url');
const ScrapeUtil = require('../lib/ScrapeUtil');
const YAML = require('yamljs');
const sprintf = require('sprintf-js').sprintf;

ScrapeUtil.retrieve({
    url: 'https://raw.githubusercontent.com/docker-library/official-images/master/library/php',
    callback: function (response) {


        var versions = [];
        var matches;
        var regExp = /Tags:\s+(.+)/g;
        while (!_.isNil(matches = regExp.exec(response.data))) {
            var tags = matches[1];
            tags = tags.split(/,\s+/);

            _.each(tags, function (tag) {
                var matches = /(\d+\.\d+\.\d+[a-zA-Z0-9]+)/.exec(tag);
                if (!_.isNil(matches)) {
                    var version = matches[1];
                    versions.push(version);
                }
            });
        }

        versions = _.uniq(versions);
        versions.sort();


        console.log(versions);


    }
});

