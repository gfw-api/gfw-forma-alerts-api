'use strict';
var logger = require('logger');
var path = require('path');
var config = require('config');
var CartoDB = require('cartodb');
var Mustache = require('mustache');
var NotFound = require('errors/notFound');
var JSONAPIDeserializer = require('jsonapi-serializer').Deserializer;

const WORLD = `
         with p as (select ST_Area(ST_SetSRID(ST_GeomFromGeoJSON('{{{geojson}}}'), 4326), TRUE)/1000 as area_ha ),
        c as (SELECT COUNT(f.*) AS value, MIN(f.date) as min_date, MAX(f.date) as max_date
        FROM forma_api f
        WHERE f.date >= '{{begin}}'::date
              AND f.date <= '{{end}}'::date
              AND ST_INTERSECTS(
                ST_SetSRID(
                  ST_GeomFromGeoJSON('{{{geojson}}}'), 4326), f.the_geom))
         SELECT  c.value, c.min_date, c.max_date, p.area_ha
        FROM c, p`;

const ISO = `
        with r as (SELECT COUNT(f.*) AS value, MIN(f.date) as min_date, MAX(f.date) as max_date
        FROM forma_api f
        WHERE f.iso = UPPER('{{iso}}') and f.date >= '{{begin}}'::date
           AND f.date <= '{{end}}'::date),
        area as (SELECT (ST_Area(geography(the_geom))/10000) as area_ha
                   FROM gadm2_countries_simple
                   WHERE iso = UPPER('{{iso}}'))
        select value, area_ha, min_date, max_date
        from r, area`;


const ID1 = `with area as (SELECT (ST_Area(geography(the_geom))/10000) as area_ha
           FROM gadm2_provinces_simple
           WHERE iso = UPPER('{{iso}}') and id_1 = {{id1}}),
        r as (SELECT COUNT(f.*) AS value, MIN(f.date) as min_date, MAX(f.date) as max_date
        FROM forma_api f
        INNER JOIN (
            SELECT *
            FROM gadm2
            WHERE id_1 = {{id1}}
                  AND iso = UPPER('{{iso}}')) g
            ON f.gadm2::int = g.objectid
            WHERE f.date >= '{{begin}}'::date
              AND f.date <= '{{end}}'::date)
        select value, area_ha, min_date, max_date from r, area`;

const USE = `SELECT COUNT(f.*) AS value, MIN(f.date) as min_date, MAX(f.date) as max_date, area_ha::numeric
            FROM {{useTable}} u
            left join forma_api f
                    on ST_Intersects(f.the_geom, u.the_geom)
            where u.cartodb_id = {{pid}}
            AND f.date >= '{{begin}}'::date
            AND f.date <= '{{end}}'::date
            group by area_ha`;

const WDPA = `WITH p as (SELECT CASE when marine::numeric = 2 then
                      null  when ST_NPoints(the_geom)<=18000 THEN the_geom
                       WHEN ST_NPoints(the_geom) BETWEEN 18000 AND 50000 THEN ST_RemoveRepeatedPoints(the_geom, 0.001)
                      ELSE ST_RemoveRepeatedPoints(the_geom, 0.005) END as the_geom, gis_area*100 as area_ha  FROM wdpa_protected_areas where wdpaid={{wdpaid}})

                SELECT COUNT(f.*) AS value, MIN(f.date) as min_date, MAX(f.date) as max_date, area_ha::numeric
                        FROM forma_api f right join p on
                     ST_Intersects(f.the_geom, p.the_geom)
                     AND f.date >= '{{begin}}'::date
                     AND f.date <= '{{end}}'::date
                        group by area_ha `;

const LATEST = `SELECT DISTINCT date
        FROM forma_api
        WHERE date IS NOT NULL
        ORDER BY date DESC
        LIMIT {{limit}}`;


var executeThunk = function(client, sql, params) {
    return function(callback) {
        logger.debug(Mustache.render(sql, params));
        client.execute(sql, params).done(function(data) {
            callback(null, data);
        }).error(function(err) {
            callback(err, null);
        });
    };
};

var deserializer = function(obj) {
    return function(callback) {
        new JSONAPIDeserializer({keyForAttribute: 'camelCase'}).deserialize(obj, callback);
    };
};


let getToday = function() {
    let today = new Date();
    return `${today.getFullYear().toString()}-${(today.getMonth()+1).toString()}-${today.getDate().toString()}`;
};

let getYesterday = function() {
    let yesterday = new Date(Date.now() - (24 * 60 * 60 * 1000));
    return `${yesterday.getFullYear().toString()}-${(yesterday.getMonth()+1).toString()}-${yesterday.getDate().toString()}`;
};


let defaultDate = function() {
    let to = getToday();
    let from = getYesterday();
    return from + ',' + to;
};

class CartoDBService {

    constructor() {
        this.client = new CartoDB.SQL({
            user: config.get('cartoDB.user')
        });
        this.apiUrl = config.get('cartoDB.apiUrl');
    }

    getDownloadUrls(query, params) {
        try{
            let formats = ['csv', 'geojson', 'kml', 'shp', 'svg'];
            let download = {};
            let queryFinal = Mustache.render(query, params);
            queryFinal = queryFinal.replace('select value, area_ha, min_date, max_date', 'select r.*, area.*');
            queryFinal = queryFinal.replace('SELECT COUNT(f.*) AS value, MIN(f.date) as min_date, MAX(f.date) as max_date, area_ha::numeric', ' SELECT f.*');
            queryFinal = queryFinal.replace('SELECT COUNT(f.*) AS value, MIN(f.date) as min_date, MAX(f.date) as max_date', ' SELECT f.*');
            queryFinal = queryFinal.replace('group by area_ha', '');
            queryFinal = encodeURIComponent(queryFinal);
            for(let i=0, length = formats.length; i < length; i++){
                download[formats[i]] = this.apiUrl + '?q=' + queryFinal + '&format=' + formats[i];
            }
            return download;
        }catch(err){
            logger.error(err);
            throw err;
        }
    }


    * getNational(iso, period = defaultDate()) {
        logger.debug('Obtaining national of iso %s', iso);
        let periods = period.split(',');
        let params = {
            iso: iso,
            begin: periods[0],
            end: periods[1]
        };

        let data = yield executeThunk(this.client, ISO, params);
        logger.debug(data);
        if (data.rows && data.rows.length > 0) {
            let result = data.rows[0];

            result.downloadUrls = this.getDownloadUrls(ISO, params);
            return result;
        }
        return null;
    }

    * getSubnational(iso, id1, period = defaultDate()) {
        logger.debug('Obtaining subnational of iso %s and id1', iso, id1);
        let periods = period.split(',');
        let params = {
            iso: iso,
            id1: id1,
            begin: periods[0],
            end: periods[1]
        };

        let data = yield executeThunk(this.client, ID1, params);
        if (data.rows && data.rows.length > 0) {
            let result = data.rows[0];

            result.downloadUrls = this.getDownloadUrls(ID1, params);
            return result;
        }
        return null;
    }

    * getUse(useTable, id, period = defaultDate()) {
        logger.debug('Obtaining use with id %s', id);
        let periods = period.split(',');
        let params = {
            useTable: useTable,
            pid: id,
            begin: periods[0],
            end: periods[1]
        };

        let data = yield executeThunk(this.client, USE, params);

        if (data.rows && data.rows.length > 0) {
            let result = data.rows[0];
            result.downloadUrls = this.getDownloadUrls(USE, params);
            return result;
        }
        return null;
    }

    * getWdpa(wdpaid, period = defaultDate()) {
        logger.debug('Obtaining wpda of id %s', wdpaid);
        let periods = period.split(',');
        let params = {
            wdpaid: wdpaid,
            begin: periods[0],
            end: periods[1]
        };

        let data = yield executeThunk(this.client, WDPA, params);
        if (data.rows && data.rows.length > 0) {
            let result = data.rows[0];
            result.downloadUrls = this.getDownloadUrls(WDPA, params);
            return result;
        }
        return null;
    }

    * getGeostore(hashGeoStore) {
        logger.debug('Obtaining geostore with hash %s', hashGeoStore);
        let result = yield require('vizz.microservice-client').requestToMicroservice({
            uri: '/geostore/' + hashGeoStore,
            method: 'GET',
            json: true
        });
        if (result.statusCode !== 200) {
            console.error('Error obtaining geostore:');
            console.error(result);
            return null;
        }
        return yield deserializer(result.body);
    }

    * getWorld(hashGeoStore, period = defaultDate()) {
        logger.debug('Obtaining world with hashGeoStore %s', hashGeoStore);

        let geostore = yield this.getGeostore(hashGeoStore);
        if (geostore && geostore.geojson) {
            return yield this.getWorldWithGeojson(geostore.geojson, period);
        }
        throw new NotFound('Geostore not found');
    }

    * getWorldWithGeojson(geojson, period = defaultDate()) {
        logger.debug('Executing query in cartodb with geojson', geojson);
        let periods = period.split(',');
        let params = {
            geojson: JSON.stringify(geojson.features[0].geometry),
            begin: periods[0],
            end: periods[1]
        };
        let data = yield executeThunk(this.client, WORLD, params);
        if (data.rows) {
            let result = data.rows[0];
            if(data.rows.length > 0){
                result.area_ha = data.rows[0].area_ha;
            }
            result.downloadUrls = this.getDownloadUrls(WORLD, params);
            return result;
        }
        return null;
    }

    * latest(limit=3) {
        logger.debug('Obtaining latest with limit %s', limit);
        let params = {
            limit: limit
        };
        let data = yield executeThunk(this.client, LATEST, params);
        logger.debug('data', data);
        if (data.rows ) {
            let result = data.rows;
            return result;
        }
        return null;
    }

}

module.exports = new CartoDBService();
