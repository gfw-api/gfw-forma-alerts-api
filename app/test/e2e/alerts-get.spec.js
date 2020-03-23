/* eslint-disable max-len */
const nock = require('nock');
const chai = require('chai');
const config = require('config');

const { getTestServer } = require('./utils/test-server');

chai.should();

const requester = getTestServer();

describe('Get datasets tests', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }
    });

    it('Get all forma alerts with no GeoJSON argument should return a 400 error', async () => {
        const response = await requester.get(`/api/v1/forma-alerts`);

        response.status.should.equal(400);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('status').and.equal(400);
        response.body.errors[0].should.have.property('detail').and.equal('GeoJSON param required');
    });

    it('Get all forma alerts with required GeoJSON argument should return a 400 error', async () => {
        nock(process.env.CT_URL)
            .get('/v1/geostore/ddc18d3a0692eea844f687c6d0fd3002')
            .reply(200, {
                data: {
                    type: 'geoStore',
                    id: 'ddc18d3a0692eea844f687c6d0fd3002',
                    attributes: {
                        geojson: {
                            features: [
                                {
                                    properties: null,
                                    type: 'Feature',
                                    geometry: {
                                        type: 'Polygon',
                                        coordinates: [
                                            [
                                                [
                                                    97.8022402524948,
                                                    3.54695899437202
                                                ],
                                                [
                                                    97.7098971605301,
                                                    3.65959283509467
                                                ],
                                                [
                                                    97.7457857877016,
                                                    3.69128687805699
                                                ],
                                                [
                                                    97.8363706916571,
                                                    3.58327709749651
                                                ],
                                                [
                                                    97.8022402524948,
                                                    3.54695899437202
                                                ]
                                            ]
                                        ]
                                    }
                                }
                            ],
                            crs: {},
                            type: 'FeatureCollection'
                        },
                        hash: 'ddc18d3a0692eea844f687c6d0fd3002',
                        provider: {},
                        areaHa: 8623.296121210287,
                        bbox: [
                            97.7098971605301,
                            3.54695899437202,
                            97.8363706916571,
                            3.69128687805699
                        ],
                        lock: true,
                        info: {
                            use: {}
                        }
                    }
                }
            });

        nock(`https://${config.get('cartoDB.user')}.cartodb.com`)
            .get('/api/v2/sql')
            .query(
                {
                    q: '\n         with area as (select ST_Area(ST_SetSRID(ST_GeomFromGeoJSON(\'{"type":"Polygon","coordinates":[[[97.8022402524948,3.54695899437202],[97.7098971605301,3.65959283509467],[97.7457857877016,3.69128687805699],[97.8363706916571,3.58327709749651],[97.8022402524948,3.54695899437202]]]}\'), 4326), TRUE)/1000 as area_ha )\n        select area.area_ha, COUNT(f.activity) AS value\n        from area left join forma_activity f on\n        ST_INTERSECTS(\n                ST_SetSRID(ST_GeomFromGeoJSON(\'{"type":"Polygon","coordinates":[[[97.8022402524948,3.54695899437202],[97.7098971605301,3.65959283509467],[97.7457857877016,3.69128687805699],[97.8363706916571,3.58327709749651],[97.8022402524948,3.54695899437202]]]}\'), 4326), f.the_geom)\n        and f.acq_date >= \'2020-3-22\'::date\n        AND f.acq_date <= \'2020-3-23\'::date\n        group by area.area_ha'
                }
            )
            .reply(200, {
                rows: [{ area_ha: 85659.8432471621, value: 0 }],
                time: 0.004,
                fields: {
                    area_ha: { type: 'number', pgtype: 'float8' },
                    value: { type: 'number', pgtype: 'int8' }
                },
                total_rows: 1
            });


        const response = await requester
            .get(`/api/v1/forma-alerts`)
            .query({
                geostore: 'ddc18d3a0692eea844f687c6d0fd3002'
            });

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('object');
        response.body.data.should.deep.equal({
            type: 'forma-alerts',
            id: 'undefined',
            attributes: {
                value: 0,
                downloadUrls: {
                    csv: 'https://wri-01.cartodb.com/api/v2/sql?q=%0A%20%20%20%20%20%20%20%20%20with%20area%20as%20(select%20ST_Area(ST_SetSRID(ST_GeomFromGeoJSON(\'%7B%22type%22%3A%22Polygon%22%2C%22coordinates%22%3A%5B%5B%5B97.8022402524948%2C3.54695899437202%5D%2C%5B97.7098971605301%2C3.65959283509467%5D%2C%5B97.7457857877016%2C3.69128687805699%5D%2C%5B97.8363706916571%2C3.58327709749651%5D%2C%5B97.8022402524948%2C3.54695899437202%5D%5D%5D%7D\')%2C%204326)%2C%20TRUE)%2F1000%20as%20area_ha%20)%0A%20%20%20%20%20%20%20%20%20select%20f.*%0A%20%20%20%20%20%20%20%20from%20area%20left%20join%20forma_activity%20f%20on%0A%20%20%20%20%20%20%20%20ST_INTERSECTS(%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20ST_SetSRID(ST_GeomFromGeoJSON(\'%7B%22type%22%3A%22Polygon%22%2C%22coordinates%22%3A%5B%5B%5B97.8022402524948%2C3.54695899437202%5D%2C%5B97.7098971605301%2C3.65959283509467%5D%2C%5B97.7457857877016%2C3.69128687805699%5D%2C%5B97.8363706916571%2C3.58327709749651%5D%2C%5B97.8022402524948%2C3.54695899437202%5D%5D%5D%7D\')%2C%204326)%2C%20f.the_geom)%0A%20%20%20%20%20%20%20%20and%20f.acq_date%20%3E%3D%20\'2020-3-22\'%3A%3Adate%0A%20%20%20%20%20%20%20%20AND%20f.acq_date%20%3C%3D%20\'2020-3-23\'%3A%3Adate%0A%20%20%20%20%20%20%20%20group%20by%20area.area_ha&format=csv',
                    geojson: 'https://wri-01.cartodb.com/api/v2/sql?q=%0A%20%20%20%20%20%20%20%20%20with%20area%20as%20(select%20ST_Area(ST_SetSRID(ST_GeomFromGeoJSON(\'%7B%22type%22%3A%22Polygon%22%2C%22coordinates%22%3A%5B%5B%5B97.8022402524948%2C3.54695899437202%5D%2C%5B97.7098971605301%2C3.65959283509467%5D%2C%5B97.7457857877016%2C3.69128687805699%5D%2C%5B97.8363706916571%2C3.58327709749651%5D%2C%5B97.8022402524948%2C3.54695899437202%5D%5D%5D%7D\')%2C%204326)%2C%20TRUE)%2F1000%20as%20area_ha%20)%0A%20%20%20%20%20%20%20%20%20select%20f.*%0A%20%20%20%20%20%20%20%20from%20area%20left%20join%20forma_activity%20f%20on%0A%20%20%20%20%20%20%20%20ST_INTERSECTS(%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20ST_SetSRID(ST_GeomFromGeoJSON(\'%7B%22type%22%3A%22Polygon%22%2C%22coordinates%22%3A%5B%5B%5B97.8022402524948%2C3.54695899437202%5D%2C%5B97.7098971605301%2C3.65959283509467%5D%2C%5B97.7457857877016%2C3.69128687805699%5D%2C%5B97.8363706916571%2C3.58327709749651%5D%2C%5B97.8022402524948%2C3.54695899437202%5D%5D%5D%7D\')%2C%204326)%2C%20f.the_geom)%0A%20%20%20%20%20%20%20%20and%20f.acq_date%20%3E%3D%20\'2020-3-22\'%3A%3Adate%0A%20%20%20%20%20%20%20%20AND%20f.acq_date%20%3C%3D%20\'2020-3-23\'%3A%3Adate%0A%20%20%20%20%20%20%20%20group%20by%20area.area_ha&format=geojson',
                    kml: 'https://wri-01.cartodb.com/api/v2/sql?q=%0A%20%20%20%20%20%20%20%20%20with%20area%20as%20(select%20ST_Area(ST_SetSRID(ST_GeomFromGeoJSON(\'%7B%22type%22%3A%22Polygon%22%2C%22coordinates%22%3A%5B%5B%5B97.8022402524948%2C3.54695899437202%5D%2C%5B97.7098971605301%2C3.65959283509467%5D%2C%5B97.7457857877016%2C3.69128687805699%5D%2C%5B97.8363706916571%2C3.58327709749651%5D%2C%5B97.8022402524948%2C3.54695899437202%5D%5D%5D%7D\')%2C%204326)%2C%20TRUE)%2F1000%20as%20area_ha%20)%0A%20%20%20%20%20%20%20%20%20select%20f.*%0A%20%20%20%20%20%20%20%20from%20area%20left%20join%20forma_activity%20f%20on%0A%20%20%20%20%20%20%20%20ST_INTERSECTS(%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20ST_SetSRID(ST_GeomFromGeoJSON(\'%7B%22type%22%3A%22Polygon%22%2C%22coordinates%22%3A%5B%5B%5B97.8022402524948%2C3.54695899437202%5D%2C%5B97.7098971605301%2C3.65959283509467%5D%2C%5B97.7457857877016%2C3.69128687805699%5D%2C%5B97.8363706916571%2C3.58327709749651%5D%2C%5B97.8022402524948%2C3.54695899437202%5D%5D%5D%7D\')%2C%204326)%2C%20f.the_geom)%0A%20%20%20%20%20%20%20%20and%20f.acq_date%20%3E%3D%20\'2020-3-22\'%3A%3Adate%0A%20%20%20%20%20%20%20%20AND%20f.acq_date%20%3C%3D%20\'2020-3-23\'%3A%3Adate%0A%20%20%20%20%20%20%20%20group%20by%20area.area_ha&format=kml',
                    shp: 'https://wri-01.cartodb.com/api/v2/sql?q=%0A%20%20%20%20%20%20%20%20%20with%20area%20as%20(select%20ST_Area(ST_SetSRID(ST_GeomFromGeoJSON(\'%7B%22type%22%3A%22Polygon%22%2C%22coordinates%22%3A%5B%5B%5B97.8022402524948%2C3.54695899437202%5D%2C%5B97.7098971605301%2C3.65959283509467%5D%2C%5B97.7457857877016%2C3.69128687805699%5D%2C%5B97.8363706916571%2C3.58327709749651%5D%2C%5B97.8022402524948%2C3.54695899437202%5D%5D%5D%7D\')%2C%204326)%2C%20TRUE)%2F1000%20as%20area_ha%20)%0A%20%20%20%20%20%20%20%20%20select%20f.*%0A%20%20%20%20%20%20%20%20from%20area%20left%20join%20forma_activity%20f%20on%0A%20%20%20%20%20%20%20%20ST_INTERSECTS(%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20ST_SetSRID(ST_GeomFromGeoJSON(\'%7B%22type%22%3A%22Polygon%22%2C%22coordinates%22%3A%5B%5B%5B97.8022402524948%2C3.54695899437202%5D%2C%5B97.7098971605301%2C3.65959283509467%5D%2C%5B97.7457857877016%2C3.69128687805699%5D%2C%5B97.8363706916571%2C3.58327709749651%5D%2C%5B97.8022402524948%2C3.54695899437202%5D%5D%5D%7D\')%2C%204326)%2C%20f.the_geom)%0A%20%20%20%20%20%20%20%20and%20f.acq_date%20%3E%3D%20\'2020-3-22\'%3A%3Adate%0A%20%20%20%20%20%20%20%20AND%20f.acq_date%20%3C%3D%20\'2020-3-23\'%3A%3Adate%0A%20%20%20%20%20%20%20%20group%20by%20area.area_ha&format=shp',
                    svg: 'https://wri-01.cartodb.com/api/v2/sql?q=%0A%20%20%20%20%20%20%20%20%20with%20area%20as%20(select%20ST_Area(ST_SetSRID(ST_GeomFromGeoJSON(\'%7B%22type%22%3A%22Polygon%22%2C%22coordinates%22%3A%5B%5B%5B97.8022402524948%2C3.54695899437202%5D%2C%5B97.7098971605301%2C3.65959283509467%5D%2C%5B97.7457857877016%2C3.69128687805699%5D%2C%5B97.8363706916571%2C3.58327709749651%5D%2C%5B97.8022402524948%2C3.54695899437202%5D%5D%5D%7D\')%2C%204326)%2C%20TRUE)%2F1000%20as%20area_ha%20)%0A%20%20%20%20%20%20%20%20%20select%20f.*%0A%20%20%20%20%20%20%20%20from%20area%20left%20join%20forma_activity%20f%20on%0A%20%20%20%20%20%20%20%20ST_INTERSECTS(%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20ST_SetSRID(ST_GeomFromGeoJSON(\'%7B%22type%22%3A%22Polygon%22%2C%22coordinates%22%3A%5B%5B%5B97.8022402524948%2C3.54695899437202%5D%2C%5B97.7098971605301%2C3.65959283509467%5D%2C%5B97.7457857877016%2C3.69128687805699%5D%2C%5B97.8363706916571%2C3.58327709749651%5D%2C%5B97.8022402524948%2C3.54695899437202%5D%5D%5D%7D\')%2C%204326)%2C%20f.the_geom)%0A%20%20%20%20%20%20%20%20and%20f.acq_date%20%3E%3D%20\'2020-3-22\'%3A%3Adate%0A%20%20%20%20%20%20%20%20AND%20f.acq_date%20%3C%3D%20\'2020-3-23\'%3A%3Adate%0A%20%20%20%20%20%20%20%20group%20by%20area.area_ha&format=svg'
                },
                areaHa: 8623.296121210287
            }
        });
    });

    afterEach(async () => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
