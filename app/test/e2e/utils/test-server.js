/* eslint-disable import/no-extraneous-dependencies */
const chai = require('chai');
const chaiHttp = require('chai-http');
const nock = require('nock');

let requester;

chai.use(chaiHttp);

const getTestServer = function getTestAgent() {
    if (requester) {
        return requester;
    }

    nock(process.env.CT_URL)
        .post(`/api/v1/microservice`)
        .reply(200);

    const server = require('../../../src/app');
    requester = chai.request(server).keepOpen();

    return requester;
};

module.exports = { getTestServer };
