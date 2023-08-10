import logger from 'logger';
import { Deserializer } from "jsonapi-serializer";
import { RWAPIMicroservice } from "rw-api-microservice-node";

class GeostoreService {

    static async getGeostore(path: string, apiKey: string): Promise<Record<string, any>> {
        logger.debug('Obtaining geostore with path %s', path);
        try {
            const result: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                uri: `/v1/geostore/${path}`,
                method: 'GET',
                headers: {
                    'x-api-key': apiKey,
                }
            });

            return await new Deserializer({
                keyForAttribute: 'camelCase'
            }).deserialize(result);
        } catch (error) {
            logger.warn('Error obtaining geostore:');
            logger.warn(error);
            return null;
        }
    }

    static async getGeostoreByHash(hash: string, apiKey: string): Promise<Record<string, any>> {
        logger.debug('Getting geostore');
        return await GeostoreService.getGeostore(hash, apiKey);
    }

    static async getGeostoreByIso(iso: string, apiKey: string): Promise<Record<string, any>> {
        logger.debug('Getting geostore by iso');
        return await GeostoreService.getGeostore(`admin/${iso}`, apiKey);
    }

    static async getGeostoreByIsoAndId(iso: string, id1: string, apiKey: string): Promise<Record<string, any>> {
        logger.debug('Getting geostore by iso and region');
        return await GeostoreService.getGeostore(`admin/${iso}/${id1}`, apiKey);
    }

    static async getGeostoreByUse(useTable: string, id: string, apiKey: string): Promise<Record<string, any>> {
        logger.debug('Getting geostore by use');
        return await GeostoreService.getGeostore(`use/${useTable}/${id}`, apiKey);
    }

    static async getGeostoreByWdpa(wdpaid: string, apiKey: string): Promise<Record<string, any>> {
        logger.debug('Getting geostore by use');
        return await GeostoreService.getGeostore(`wdpa/${wdpaid}`, apiKey);
    }

}

export default GeostoreService;
