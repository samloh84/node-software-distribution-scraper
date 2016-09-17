global.Promise = require('bluebird');
const axios = require('axios');
const cheerio = require('cheerio');
const url = require('url');
const _ = require('lodash');

function retrieveLinks(urlToRetrieve) {
    if (_.isArray(urlToRetrieve)) {
        return Promise.map(_.uniq(urlToRetrieve), retrieveLinks)
            .then(function (links) {
                links = _.uniq(_.flatten(links));
                links.sort();
                return links;
            });
    }

    console.log('Retrieving URL ' + urlToRetrieve);

    return axios.get(urlToRetrieve)
        .then(function (response) {
            console.log('Retrieved URL ' + urlToRetrieve);

            $ = cheerio.load(response.data);
            var linkElements = $('a');
            var links = [];
            linkElements.each(function () {
                var linkUrl = $(this).attr('href');
                if (linkUrl) {
                    linkUrl = url.resolve(urlToRetrieve, linkUrl);
                    links.push(linkUrl);
                }
            });
            return links;
        });
}

function retrieveScriptLinks(urlToRetrieve) {
    if (_.isArray(urlToRetrieve)) {
        return Promise.map(_.uniq(urlToRetrieve), retrieveScriptLinks)
            .then(function (links) {
                links = _.uniq(_.flatten(links));
                links.sort();
                return links;
            });
    }

    console.log('Retrieving URL ' + urlToRetrieve);

    return axios.get(urlToRetrieve)
        .then(function (response) {
            console.log('Retrieved URL ' + urlToRetrieve);

            $ = cheerio.load(response.data);
            var scriptElements = $('script');
            var links = [];
            scriptElements.each(function () {
                var scriptContent = $(this).text();

                const regex = /(\b(https?|ftp|file):\/\/[\-A-Z0-9+&@#\/%?=~_|!:,.;]*[\-A-Z0-9+&@#\/%=~_|])/ig;

                _.each(scriptContent.match(regex), function (link) {
                    links.push(link);
                });


            });

            console.log(links);

            return links;


        });
}

module.exports = {
    retrieveLinks: retrieveLinks,
    retrieveScriptLinks: retrieveScriptLinks
};
