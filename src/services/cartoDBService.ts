import config from 'config';
import logger from 'logger';
import Mustache from 'mustache';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import CartoDB from 'cartodb';
import NotFound from "errors/notFound";
import GeostoreService from "services/geostoreService";

const WORLD_WITH_AREA: string = `
         with area as (select ST_Area(ST_SetSRID(ST_GeomFromGeoJSON('{{{geojson}}}'), 4326), TRUE)/1000 as area_ha )
        select area.area_ha, COUNT(f.activity) AS value
        from area left join forma_activity f on
        ST_INTERSECTS(
                ST_SetSRID(ST_GeomFromGeoJSON('{{{geojson}}}'), 4326), f.the_geom)
        and f.acq_date >= '{{begin}}'::date
        AND f.acq_date <= '{{end}}'::date
        group by area.area_ha`;

const ISO: string = `
        with area as (select the_geom from gadm28_countries where iso = UPPER('{{iso}}'))
        select COUNT(f.activity) AS value
        from area inner join forma_activity f on
        ST_Intersects(f.the_geom, area.the_geom)
        and f.acq_date >= '{{begin}}'::date
        AND f.acq_date <= '{{end}}'::date
`;


const ID1: string = `
        with area as (select the_geom from gadm28_adm1 where iso = UPPER('{{iso}}') and id_1 = {{id1}})
        select COUNT(f.activity) AS value
        from area inner join forma_activity f on
        ST_Intersects(f.the_geom, area.the_geom)
        and f.acq_date >= '{{begin}}'::date
        AND f.acq_date <= '{{end}}'::date`;

const USE: string = `
        with area as (select the_geom from {{useTable}} where cartodb_id = {{pid}})
        select COUNT(f.activity) AS value
        from area inner join forma_activity f on
        ST_Intersects(f.the_geom, area.the_geom)
        and f.acq_date >= '{{begin}}'::date
        AND f.acq_date <= '{{end}}'::date
`;

const WDPA: string = `WITH area as (SELECT CASE when marine::numeric = 2 then
                      null  when ST_NPoints(the_geom)<=18000 THEN the_geom
                       WHEN ST_NPoints(the_geom) BETWEEN 18000 AND 50000 THEN ST_RemoveRepeatedPoints(the_geom, 0.001)
                      ELSE ST_RemoveRepeatedPoints(the_geom, 0.005) END as the_geom  FROM wdpa_protected_areas where wdpaid={{wdpaid}})

                select COUNT(f.activity) AS value
        from area inner join forma_activity f on
        ST_Intersects(f.the_geom, area.the_geom)
        and f.acq_date >= '{{begin}}'::date
        AND f.acq_date <= '{{end}}'::date`;

const executeThunk = async (client: CartoDB.SQL, sql: string, params: any): Promise<Record<string, any>> => (new Promise((resolve: (value: (PromiseLike<unknown> | unknown)) => void, reject: (reason?: any) => void) => {
    logger.debug(Mustache.render(sql, params));
    client.execute(sql, params).done((data: Record<string, any>) => {
        resolve(data);
    }).error((error: Error) => {
        reject(error);
    });
}));


const getToday = (): string => {
    const today: Date = new Date();
    return `${today.getFullYear().toString()}-${(today.getMonth() + 1).toString()}-${today.getDate().toString()}`;
};

const getYesterday = (): string => {
    const yesterday: Date = new Date(Date.now() - (24 * 60 * 60 * 1000));
    return `${yesterday.getFullYear().toString()}-${(yesterday.getMonth() + 1).toString()}-${yesterday.getDate().toString()}`;
};


const defaultDate = (): string => {
    const to: string = getToday();
    const from: string = getYesterday();
    return `${from},${to}`;
};


const getURLForSubscription = (query: string): string => {
    return query.replace('select COUNT(f.activity) AS value', 'SELECT f.*');
};

class CartoDBService {

    client: CartoDB.SQL;
    apiUrl: string;

    constructor() {
        this.client = new CartoDB.SQL({
            user: config.get('cartoDB.user')
        });
        this.apiUrl = config.get('cartoDB.apiUrl');
    }

    getDownloadUrls(query: string, params: Record<string, any>): Record<string, any> | void {
        try {
            const formats: string[] = ['csv', 'geojson', 'kml', 'shp', 'svg'];
            const download: Record<string, any> = {};
            let queryFinal: string = Mustache.render(query, params);
            queryFinal = queryFinal.replace('select value, area_ha, min_date, max_date', 'select r.*, area.*');
            queryFinal = queryFinal.replace('SELECT COUNT(f.alerts) AS alerts,  area_ha::numeric', ' SELECT f.*');
            queryFinal = queryFinal.replace('SELECT COUNT(f.alerts) AS alerts', ' SELECT f.*');
            queryFinal = queryFinal.replace('select COUNT(f.activity) AS alerts', ' select f.*');
            queryFinal = queryFinal.replace('select area.area_ha, COUNT(f.activity) AS value', ' select f.*');
            queryFinal = encodeURIComponent(queryFinal);
            for (let i: number = 0, { length }: string[] = formats; i < length; i++) {
                download[formats[i]] = `${this.apiUrl}?q=${queryFinal}&format=${formats[i]}`;
            }
            return download;
        } catch (err) {
            logger.error(err);
            throw err;
        }
    }

    async getNational(iso: string, forSubscription: string, period: string = defaultDate(), apiKey: string): Promise<Record<string, any> | void> {
        logger.debug('Obtaining national of iso %s', iso);
        const periods: string[] = period.split(',');
        const params: { iso: string; end: string; begin: string } = {
            iso,
            begin: periods[0],
            end: periods[1]
        };
        let query: string = ISO;
        if (forSubscription) {
            query = getURLForSubscription(ISO);
        }
        const geostore: Record<string, any> = await GeostoreService.getGeostoreByIso(iso, apiKey);
        const data: Record<string, any> = await executeThunk(this.client, query, params);
        if (geostore) {
            if (forSubscription && data.rows) {
                return data.rows;
            }
            if (data.rows && data.rows.length > 0) {
                const result: Record<string, any> = data.rows[0];
                result.area_ha = geostore.areaHa;
                result.downloadUrls = this.getDownloadUrls(ISO, params);
                return result;
            }
            return {
                area_ha: geostore.areaHa
            };

        }
        return null;
    }

    async getSubnational(iso: string, id1: string, forSubscription: string, period: string = defaultDate(), apiKey: string): Promise<Record<string, any> | void> {
        logger.debug('Obtaining subnational of iso %s and id1', iso, id1);
        const periods: string[] = period.split(',');
        const params: { iso: any; id1: any; end: string; begin: string } = {
            iso,
            id1,
            begin: periods[0],
            end: periods[1]
        };
        let query: string = ID1;
        if (forSubscription) {
            query = getURLForSubscription(ID1);
        }
        const geostore: Record<string, any> = await GeostoreService.getGeostoreByIsoAndId(iso, id1, apiKey);
        const data: Record<string, any> = await executeThunk(this.client, query, params);
        if (geostore) {
            if (forSubscription && data.rows) {
                return data.rows;
            }
            if (data.rows && data.rows.length > 0) {
                const result: Record<string, any> = data.rows[0];
                result.area_ha = geostore.areaHa;
                result.downloadUrls = this.getDownloadUrls(ID1, params);
                return result;
            }
            return {
                area_ha: geostore.areaHa
            };

        }
        return null;
    }

    async getUse(useName: string, useTable: string, id: string, forSubscription: string, period: string = defaultDate(), apiKey: string): Promise<Record<string, any> | void> {
        logger.debug('Obtaining use with id %s', id);
        const periods: string[] = period.split(',');
        const params: { pid: any; end: string; useTable: any; begin: string } = {
            useTable,
            pid: id,
            begin: periods[0],
            end: periods[1]
        };
        let query: string = USE;
        if (forSubscription) {
            query = getURLForSubscription(USE);
        }
        const geostore: Record<string, any> = await GeostoreService.getGeostoreByUse(useName, id, apiKey);
        const data: Record<string, any> = await executeThunk(this.client, query, params);
        if (geostore) {
            if (forSubscription && data.rows) {
                return data.rows;
            }
            if (data.rows && data.rows.length > 0) {
                const result: Record<string, any> = data.rows[0];
                result.area_ha = geostore.areaHa;
                result.downloadUrls = this.getDownloadUrls(USE, params);
                return result;
            }
            return {
                area_ha: geostore.areaHa
            };

        }
        return null;
    }

    async getWdpa(wdpaid: string, forSubscription: string, period: string = defaultDate(), apiKey: string): Promise<Record<string, any> | void> {
        logger.debug('Obtaining wpda of id %s', wdpaid);
        const periods: string[] = period.split(',');
        const params: { end: string; begin: string; wdpaid: any } = {
            wdpaid,
            begin: periods[0],
            end: periods[1]
        };
        let query: string = WDPA;
        if (forSubscription) {
            query = getURLForSubscription(WDPA);
        }
        const geostore: Record<string, any> = await GeostoreService.getGeostoreByWdpa(wdpaid, apiKey);
        const data: Record<string, any> = await executeThunk(this.client, query, params);
        if (geostore) {
            if (forSubscription && data.rows) {
                return data.rows;
            }
            if (data.rows && data.rows.length > 0) {
                const result: Record<string, any> = data.rows[0];
                result.area_ha = geostore.areaHa;
                result.downloadUrls = this.getDownloadUrls(WDPA, params);
                return result;
            }
            return {
                area_ha: geostore.areaHa
            };

        }
        return null;
    }

    async getWorld(hashGeoStore: string, forSubscription: string, period: string = defaultDate(), apiKey: string): Promise<Record<string, any> | void> {
        logger.debug('Obtaining world with hashGeoStore %s', hashGeoStore);

        const geostore: Record<string, any> = await GeostoreService.getGeostoreByHash(hashGeoStore, apiKey);
        if (geostore && geostore.geojson) {
            return await this.getWorldWithGeojson(geostore.geojson, forSubscription, period, geostore.areaHa);
        }
        throw new NotFound('Geostore not found');
    }

    async getWorldWithGeojson(geojson: Record<string, any>, forSubscription: string, period: string = defaultDate(), areaHa: string = null): Promise<Record<string, any> | void> {
        logger.debug('Executing query in cartodb with geojson', geojson);
        const periods: string[] = period.split(',');
        const params: { geojson: string; end: string; begin: string } = {
            geojson: JSON.stringify(geojson.features[0].geometry),
            begin: periods[0],
            end: periods[1]
        };
        let query: string = WORLD_WITH_AREA;
        if (forSubscription) {
            query = getURLForSubscription(WORLD_WITH_AREA);
        }
        const data: Record<string, any> = await executeThunk(this.client, query, params);
        if (forSubscription && data.rows) {
            return data.rows;
        }
        if (data.rows) {
            const result: Record<string, any> = data.rows[0];
            if (data.rows.length > 0) {
                if (areaHa) {
                    result.area_ha = areaHa;
                } else {
                    result.area_ha = data.rows[0].area_ha;
                }
            }
            result.downloadUrls = this.getDownloadUrls(WORLD_WITH_AREA, params);
            return result;
        }
        return null;
    }

}

export default new CartoDBService();
