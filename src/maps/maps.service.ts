import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

export interface GeoPoint {
  lat: number;
  lng: number;
  formattedAddress?: string;
}

export interface TripMeasure {
  pickup: GeoPoint;
  dropoff: GeoPoint;
  distanceMeters: number;
  durationSeconds: number;
  tollPresent: boolean; // Google signale un péage sur l'itinéraire (sans le prix au Sénégal)
}

/**
 * Accès à Google Maps Platform : Geocoding (adresse -> coordonnées) et
 * Routes (distance + durée réelles). La clé vit dans GOOGLE_MAPS_API_KEY.
 */
@Injectable()
export class MapsService {
  private get key(): string {
    const k = process.env.GOOGLE_MAPS_API_KEY;
    if (!k) {
      throw new ServiceUnavailableException(
        'Clé Google Maps absente. Renseigne GOOGLE_MAPS_API_KEY dans .env.',
      );
    }
    return k;
  }

  /** Adresse -> coordonnées (biaisé Sénégal, réponses en français). */
  async geocode(address: string): Promise<GeoPoint> {
    const url =
      'https://maps.googleapis.com/maps/api/geocode/json' +
      `?address=${encodeURIComponent(address)}&region=sn&language=fr&key=${this.key}`;
    const res = await fetch(url);
    const data: any = await res.json();
    if (data.status !== 'OK' || !data.results?.length) {
      throw new BadRequestException(`Adresse introuvable : « ${address} »`);
    }
    const r = data.results[0];
    return {
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
      formattedAddress: r.formatted_address,
    };
  }

  /** Distance + durée réelles entre deux points (Routes API computeRoutes). */
  async route(
    origin: GeoPoint,
    dest: GeoPoint,
  ): Promise<{ distanceMeters: number; durationSeconds: number; tollPresent: boolean }> {
    const res = await fetch(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.key,
          'X-Goog-FieldMask':
            'routes.distanceMeters,routes.duration,routes.travelAdvisory.tollInfo',
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
          destination: { location: { latLng: { latitude: dest.lat, longitude: dest.lng } } },
          travelMode: 'DRIVE',
          extraComputations: ['TOLLS'],
        }),
      },
    );
    const data: any = await res.json();
    if (!data.routes?.length) {
      throw new BadRequestException('Aucun itinéraire trouvé entre ces deux adresses.');
    }
    const route = data.routes[0];
    const durationSeconds = parseInt(String(route.duration ?? '0').replace('s', ''), 10) || 0;
    const tollPresent = !!route.travelAdvisory?.tollInfo;
    return { distanceMeters: route.distanceMeters ?? 0, durationSeconds, tollPresent };
  }

  /** Géocode les deux adresses puis mesure l'itinéraire. */
  async measureTrip(pickupAddress: string, dropoffAddress: string): Promise<TripMeasure> {
    const [pickup, dropoff] = await Promise.all([
      this.geocode(pickupAddress),
      this.geocode(dropoffAddress),
    ]);
    const r = await this.route(pickup, dropoff);
    return { pickup, dropoff, ...r };
  }
}
