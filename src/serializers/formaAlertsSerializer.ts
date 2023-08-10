import { Serializer } from 'jsonapi-serializer';

const formaAlertsSerializer: Serializer = new Serializer('forma-alerts', {
    attributes: ['value', 'period', 'downloadUrls', 'area_ha', 'latitude', 'longitude', 'acq_date', 'acq_time'],
    typeForAttribute: (attribute: string) => attribute,
    downloadUrls: {
        attributes: ['csv', 'geojson', 'kml', 'shp', 'svg']
    },
    keyForAttribute: 'camelCase'
});

const formaLatestSerializer: Serializer = new Serializer('imazon-latest', {
    attributes: ['date'],
    typeForAttribute: (attribute: string) => attribute,
});

class FormaAlertsSerializer {

    static serialize(data: Record<string, any>): Record<string, any> {
        return formaAlertsSerializer.serialize(data);
    }

    static serializeLatest(data: Record<string, any>): Record<string, any> {
        return formaLatestSerializer.serialize(data);
    }

}

export default FormaAlertsSerializer;
