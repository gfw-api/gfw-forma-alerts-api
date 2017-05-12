'use strict';

var logger = require('logger');
var JSONAPISerializer = require('jsonapi-serializer').Serializer;
var formaAlertsSerializer = new JSONAPISerializer('forma-alerts', {
    attributes: ['alerts', 'downloadUrls', 'area_ha'],
    typeForAttribute: function(attribute, record) {
        return attribute;
    },
    downloadUrls: {
        attributes: ['csv', 'geojson', 'kml', 'shp', 'svg']
    },
    keyForAttribute: 'camelCase'
});

var formaLatestSerializer = new JSONAPISerializer('imazon-latest', {
    attributes: ['date'],
    typeForAttribute: function(attribute, record) {
        return attribute;
    }
});

class FormaAlertsSerializer {

    static serialize(data) {
        return formaAlertsSerializer.serialize(data);
    }
    static serializeLatest(data) {
        return formaLatestSerializer.serialize(data);
    }
}

module.exports = FormaAlertsSerializer;
