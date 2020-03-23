
const logger = require('logger');
const config = require('config');
const CartoDB = require('cartodb');
const Mustache = require('mustache');
const NotFound = require('errors/notFound');
const GeostoreService = require('services/geostoreService');

const WORLD_WITH_AREA = `
         with area as (select ST_Area(ST_SetSRID(ST_GeomFromGeoJSON('{{{geojson}}}'), 4326), TRUE)/1000 as area_ha )
        select area.area_ha, COUNT(f.activity) AS value
        from area left join forma_activity f on
        ST_INTERSECTS(
                ST_SetSRID(ST_GeomFromGeoJSON('{{{geojson}}}'), 4326), f.the_geom)
        and f.acq_date >= '{{begin}}'::date
        AND f.acq_date <= '{{end}}'::date
        group by area.area_ha`;

const ISO = `
        with area as (select the_geom from gadm28_countries where iso = UPPER('{{iso}}'))
        select COUNT(f.activity) AS value
        from area inner join forma_activity f on
        ST_Intersects(f.the_geom, area.the_geom)
        and f.acq_date >= '{{begin}}'::date
        AND f.acq_date <= '{{end}}'::date
`;


const ID1 = `
        with area as (select the_geom from gadm28_adm1 where iso = UPPER('{{iso}}') and id_1 = {{id1}})
        select COUNT(f.activity) AS value
        from area inner join forma_activity f on
        ST_Intersects(f.the_geom, area.the_geom)
        and f.acq_date >= '{{begin}}'::date
        AND f.acq_date <= '{{end}}'::date`;

const USE = `
        with area as (select the_geom from {{useTable}} where cartodb_id = {{pid}})
        select COUNT(f.activity) AS value
        from area inner join forma_activity f on
        ST_Intersects(f.the_geom, area.the_geom)
        and f.acq_date >= '{{begin}}'::date
        AND f.acq_date <= '{{end}}'::date
`;

const WDPA = `WITH area as (SELECT CASE when marine::numeric = 2 then
                      null  when ST_NPoints(the_geom)<=18000 THEN the_geom
                       WHEN ST_NPoints(the_geom) BETWEEN 18000 AND 50000 THEN ST_RemoveRepeatedPoints(the_geom, 0.001)
                      ELSE ST_RemoveRepeatedPoints(the_geom, 0.005) END as the_geom  FROM wdpa_protected_areas where wdpaid={{wdpaid}})

                select COUNT(f.activity) AS value
        from area inner join forma_activity f on
        ST_Intersects(f.the_geom, area.the_geom)
        and f.acq_date >= '{{begin}}'::date
        AND f.acq_date <= '{{end}}'::date`;

const executeThunk = (client, sql, params) => (callback) => {
    logger.debug(Mustache.render(sql, params));
    client.execute(sql, params).done((data) => {
        callback(null, data);
    }).error((err) => {
        callback(err, null);
    });
};


const getToday = () => {
    const today = new Date();
    return `${today.getFullYear().toString()}-${(today.getMonth() + 1).toString()}-${today.getDate().toString()}`;
};

const getYesterday = () => {
    const yesterday = new Date(Date.now() - (24 * 60 * 60 * 1000));
    return `${yesterday.getFullYear().toString()}-${(yesterday.getMonth() + 1).toString()}-${yesterday.getDate().toString()}`;
};


const defaultDate = () => {
    const to = getToday();
    const from = getYesterday();
    return `${from},${to}`;
};


const getURLForSubscription = (query) => {
    const queryFinal = query.replace('select COUNT(f.activity) AS value', 'SELECT f.*');
    return queryFinal;
};

class CartoDBService {

    constructor() {
        this.client = new CartoDB.SQL({
            user: config.get('cartoDB.user')
        });
        this.apiUrl = config.get('cartoDB.apiUrl');
    }

    getDownloadUrls(query, params) {
        try {
            const formats = ['csv', 'geojson', 'kml', 'shp', 'svg'];
            const download = {};
            let queryFinal = Mustache.render(query, params);
            queryFinal = queryFinal.replace('select value, area_ha, min_date, max_date', 'select r.*, area.*');
            queryFinal = queryFinal.replace('SELECT COUNT(f.alerts) AS alerts,  area_ha::numeric', ' SELECT f.*');
            queryFinal = queryFinal.replace('SELECT COUNT(f.alerts) AS alerts', ' SELECT f.*');
            queryFinal = queryFinal.replace('select COUNT(f.activity) AS alerts', ' select f.*');
            queryFinal = queryFinal.replace('select area.area_ha, COUNT(f.activity) AS value', ' select f.*');
            queryFinal = encodeURIComponent(queryFinal);
            for (let i = 0, { length } = formats; i < length; i++) {
                download[formats[i]] = `${this.apiUrl}?q=${queryFinal}&format=${formats[i]}`;
            }
            return download;
        } catch (err) {
            logger.error(err);
            throw err;
        }
    }

    * getNational(iso, forSubscription, period = defaultDate()) {
        logger.debug('Obtaining national of iso %s', iso);
        const periods = period.split(',');
        const params = {
            iso,
            begin: periods[0],
            end: periods[1]
        };
        let query = ISO;
        if (forSubscription) {
            query = getURLForSubscription(ISO);
        }
        const geostore = yield GeostoreService.getGeostoreByIso(iso);
        const data = yield executeThunk(this.client, query, params);
        if (geostore) {
            if (forSubscription && data.rows) {
                return data.rows;
            }
            if (data.rows && data.rows.length > 0) {
                const result = data.rows[0];
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

    * getSubnational(iso, id1, forSubscription, period = defaultDate()) {
        logger.debug('Obtaining subnational of iso %s and id1', iso, id1);
        const periods = period.split(',');
        const params = {
            iso,
            id1,
            begin: periods[0],
            end: periods[1]
        };
        let query = ID1;
        if (forSubscription) {
            query = getURLForSubscription(ID1);
        }
        const geostore = yield GeostoreService.getGeostoreByIsoAndId(iso, id1);
        const data = yield executeThunk(this.client, query, params);
        if (geostore) {
            if (forSubscription && data.rows) {
                return data.rows;
            }
            if (data.rows && data.rows.length > 0) {
                const result = data.rows[0];
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

    * getUse(useName, useTable, id, forSubscription, period = defaultDate()) {
        logger.debug('Obtaining use with id %s', id);
        const periods = period.split(',');
        const params = {
            useTable,
            pid: id,
            begin: periods[0],
            end: periods[1]
        };
        let query = USE;
        if (forSubscription) {
            query = getURLForSubscription(USE);
        }
        const geostore = yield GeostoreService.getGeostoreByUse(useName, id);
        const data = yield executeThunk(this.client, query, params);
        if (geostore) {
            if (forSubscription && data.rows) {
                return data.rows;
            }
            if (data.rows && data.rows.length > 0) {
                const result = data.rows[0];
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

    * getWdpa(wdpaid, forSubscription, period = defaultDate()) {
        logger.debug('Obtaining wpda of id %s', wdpaid);
        const periods = period.split(',');
        const params = {
            wdpaid,
            begin: periods[0],
            end: periods[1]
        };
        let query = WDPA;
        if (forSubscription) {
            query = getURLForSubscription(WDPA);
        }
        const geostore = yield GeostoreService.getGeostoreByWdpa(wdpaid);
        const data = yield executeThunk(this.client, query, params);
        if (geostore) {
            if (forSubscription && data.rows) {
                return data.rows;
            }
            if (data.rows && data.rows.length > 0) {
                const result = data.rows[0];
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

    * getWorld(hashGeoStore, forSubscription, period = defaultDate()) {
        logger.debug('Obtaining world with hashGeoStore %s', hashGeoStore);

        const geostore = yield GeostoreService.getGeostoreByHash(hashGeoStore);
        if (geostore && geostore.geojson) {
            return yield this.getWorldWithGeojson(geostore.geojson, forSubscription, period, geostore.areaHa);
        }
        throw new NotFound('Geostore not found');
    }

    * getWorldWithGeojson(geojson, forSubscription, period = defaultDate(), areaHa = null) {
        logger.debug('Executing query in cartodb with geojson', geojson);
        const periods = period.split(',');
        const params = {
            geojson: JSON.stringify(geojson.features[0].geometry),
            begin: periods[0],
            end: periods[1]
        };
        let query = WORLD_WITH_AREA;
        if (forSubscription) {
            query = getURLForSubscription(WORLD_WITH_AREA);
        }
        const data = yield executeThunk(this.client, query, params);
        if (forSubscription && data.rows) {
            return data.rows;
        }
        if (data.rows) {
            const result = data.rows[0];
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

module.exports = new CartoDBService();
