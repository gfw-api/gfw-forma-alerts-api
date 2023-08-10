import Router from 'koa-router';
import logger from 'logger';
import { Context, Next } from 'koa';
import CartoDBService from 'services/cartoDBService';
import NotFound from 'errors/notFound';
import FormaAlertsSerializer from 'serializers/formaAlertsSerializer';


const router: Router = new Router({
    prefix: '/api/v1/forma-alerts'
});

class FormaAlertsRouter {

    static async getNational(ctx: Context): Promise<void> {
        logger.info('Obtaining national data');
        const data: Record<string, any> | void = await CartoDBService.getNational(
            ctx.params.iso,
            ctx.request.query.forSubscription as string,
            ctx.request.query.period as string,
            ctx.request.headers['x-api-key'] as string
        );

        // TODO: null values should be better handled
        ctx.response.body = FormaAlertsSerializer.serialize(data as Record<string, any>);
    }

    static async getSubnational(ctx: Context): Promise<void> {
        logger.info('Obtaining subnational data');
        const data: Record<string, any> | void = await CartoDBService.getSubnational(
            ctx.params.iso,
            ctx.params.id1,
            ctx.request.query.forSubscription as string,
            ctx.request.query.period as string,
            ctx.request.headers['x-api-key'] as string
        );

        // TODO: null values should be better handled
        ctx.response.body = FormaAlertsSerializer.serialize(data as Record<string, any>);
    }

    static async use(ctx: Context): Promise<void> {
        logger.info('Obtaining use data with name %s and id %s', ctx.params.name, ctx.params.id);
        let useTable: string = null;
        switch (ctx.params.name) {

            case 'mining':
                useTable = 'gfw_mining';
                break;
            case 'oilpalm':
                useTable = 'gfw_oil_palm';
                break;
            case 'fiber':
                useTable = 'gfw_wood_fiber';
                break;
            case 'logging':
                useTable = 'gfw_logging';
                break;
            default:
                ctx.throw(400, 'Name param invalid');

        }
        if (!useTable) {
            ctx.throw(404, 'Name not found');
        }
        const data: Record<string, any> | void = await CartoDBService.getUse(
            ctx.params.name,
            useTable,
            ctx.params.id,
            ctx.request.query.forSubscription as string,
            ctx.request.query.period as string,
            ctx.request.headers['x-api-key'] as string
        );

        // TODO: null values should be better handled
        ctx.response.body = FormaAlertsSerializer.serialize(data as Record<string, any>);
    }

    static async wdpa(ctx: Context): Promise<void> {
        logger.info('Obtaining wpda data with id %s', ctx.params.id);
        const data: Record<string, any> | void = await CartoDBService.getWdpa(
            ctx.params.id,
            ctx.request.query.forSubscription as string,
            ctx.request.query.period as string,
            ctx.request.headers['x-api-key'] as string
        );

        // TODO: null values should be better handled
        ctx.response.body = FormaAlertsSerializer.serialize(data as Record<string, any>);
    }

    static checkGeojson(geojson: Record<string, any>): Record<string, any> {
        if (geojson.type.toLowerCase() === 'polygon') {
            return {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: geojson
                }]
            };
        }
        if (geojson.type.toLowerCase() === 'feature') {
            return {
                type: 'FeatureCollection',
                features: [geojson]
            };
        }
        return geojson;
    }

    static async world(ctx: Context): Promise<void> {
        logger.info('Obtaining world data');
        ctx.assert(ctx.request.query.geostore, 400, 'GeoJSON param required');
        try {
            const data: Record<string, any> | void = await CartoDBService.getWorld(
                ctx.request.query.geostore as string,
                ctx.request.query.forSubscription as string,
                ctx.request.query.period as string,
                ctx.request.headers['x-api-key'] as string
            );

            // TODO: null values should be better handled
            ctx.response.body = FormaAlertsSerializer.serialize(data as Record<string, any>);
        } catch (err) {
            if (err instanceof NotFound) {
                ctx.throw(404, 'Geostore not found');
                return;
            }
            throw err;
        }

    }

    static async worldWithGeojson(ctx: Context): Promise<void> {
        logger.info('Obtaining world data with geostore');
        ctx.assert((ctx.request.body as Record<string, any>).geojson, 400, 'GeoJSON param required');
        try {
            const data: Record<string, any> | void = await CartoDBService.getWorldWithGeojson(
                FormaAlertsRouter.checkGeojson((ctx.request.body as Record<string, any>).geojson as Record<string, any>),
                ctx.request.query.forSubscription as string,
                ctx.request.query.period as string
            );

            // TODO: null values should be better handled
            ctx.response.body = FormaAlertsSerializer.serialize(data as Record<string, any>);
        } catch (err) {
            if (err instanceof NotFound) {
                ctx.throw(404, 'Geostore not found');
                return;
            }
            throw err;
        }

    }
}

const isCached = async (ctx: Context, next: Next): Promise<void> => {
    if (await ctx.cashed()) {
        return;
    }
    await next();
};


router.get('/admin/:iso', isCached, FormaAlertsRouter.getNational);
router.get('/admin/:iso/:id1', isCached, FormaAlertsRouter.getSubnational);
router.get('/use/:name/:id', isCached, FormaAlertsRouter.use);
router.get('/wdpa/:id', isCached, FormaAlertsRouter.wdpa);
router.get('/', isCached, FormaAlertsRouter.world);
router.post('/', FormaAlertsRouter.worldWithGeojson);


export default router;
