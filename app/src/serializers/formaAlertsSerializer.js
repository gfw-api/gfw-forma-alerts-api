const JSONAPISerializer = require('jsonapi-serializer').Serializer;

const formaAlertsSerializer = new JSONAPISerializer('forma-alerts', {
    attributes: ['value', 'period', 'downloadUrls', 'area_ha', 'latitude', 'longitude', 'acq_date', 'acq_time'],
    typeForAttribute(attribute) {
        return attribute;
    },
    downloadUrls: {
        attributes: ['csv', 'geojson', 'kml', 'shp', 'svg']
    },
    keyForAttribute: 'camelCase'
});

const formaLatestSerializer = new JSONAPISerializer('imazon-latest', {
    attributes: ['date'],
    typeForAttribute(attribute) {
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
