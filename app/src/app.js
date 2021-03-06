const config = require('config');
const logger = require('logger');
const koa = require('koa');
const convert = require('koa-convert');
const koaSimpleHealthCheck = require('koa-simple-healthcheck');
const bodyParser = require('koa-bodyparser');
const koaLogger = require('koa-logger');
const loader = require('loader');
const validate = require('koa-validate');
const ErrorSerializer = require('serializers/errorSerializer');
const { RWAPIMicroservice } = require('rw-api-microservice-node');

const app = koa();

if (process.env.NODE_ENV === 'dev') {
    app.use(koaLogger());
}

app.use(bodyParser({
    jsonLimit: '50mb'
}));

app.use(function* handleErrors(next) {
    try {
        yield next;
    } catch (inErr) {
        let error = inErr;
        try {
            error = JSON.parse(inErr);
        } catch (e) {
            logger.debug('Could not parse error message - is it JSON?: ', inErr);
            error = inErr;
        }
        this.status = error.status || this.status || 500;
        if (this.status >= 500) {
            logger.error(error);
        } else {
            logger.info(error);
        }

        this.body = ErrorSerializer.serializeError(this.status, error.message);
        if (process.env.NODE_ENV === 'prod' && this.status === 500) {
            this.body = 'Unexpected error';
        }
    }
    this.response.type = 'application/vnd.api+json';
});

const cache = require('lru-cache')({
    maxAge: 30000 // global max age
});

app.use(convert.back(koaSimpleHealthCheck()));

app.use(require('koa-cash')({
    get(key) {
        logger.debug('Getting the cache key: %s', key);
        return cache.get(key);
    },
    set(key, value) {
        logger.debug('Setting in cache. key: %s, value: ', key, value);
        cache.set(key, value);
    }
}));

// load custom validator
app.use(validate());

app.use(convert.back(RWAPIMicroservice.bootstrap({
    name: config.get('service.name'),
    info: require('../microservice/register.json'),
    swagger: require('../microservice/public-swagger.json'),
    logger,
    baseURL: process.env.CT_URL,
    url: process.env.LOCAL_URL,
    token: process.env.CT_TOKEN,
    fastlyEnabled: process.env.FASTLY_ENABLED,
    fastlyServiceId: process.env.FASTLY_SERVICEID,
    fastlyAPIKey: process.env.FASTLY_APIKEY
})));

// load routes
loader.loadRoutes(app);

// Instance of http module
const appServer = require('http').Server(app.callback());

// get port of environment, if not exist obtain of the config.
// In production environment, the port must be declared in environment variable
const port = process.env.PORT || config.get('service.port');

const server = appServer.listen(process.env.PORT, () => {
    if (process.env.CT_REGISTER_MODE === 'auto') {
        RWAPIMicroservice.register().then(() => {
            logger.info('CT registration process started');
        }, (error) => {
            logger.error(error);
            process.exit(1);
        });
    }
});


logger.info(`Server started in port:${port}`);

module.exports = server;
