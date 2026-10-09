/**
 * Vehicles and infrastructure. Distances are in km (1 map cell = 1 km).
 * The trade-offs are what matter: trucks are cheap to start with but costly
 * per ton-km; rail and ships (later) need big up-front investment but move
 * bulk goods cheaply.
 */
export interface VehicleDef {
  id: string;
  name: string;
  mode: 'road' | 'rail' | 'sea';
  /** Tons per trip. */
  capacity: number;
  /** km per day. */
  speed: number;
  price: number;
  /** Fixed daily cost per vehicle (driver, insurance). */
  dailyCost: number;
  /** Running cost per km (fuel, wear). */
  perKm: number;
  lifeYears: number;
}

export const VEHICLES: Record<string, VehicleDef> = {
  truck: {
    id: 'truck',
    name: 'Truck',
    mode: 'road',
    capacity: 10,
    speed: 16,
    price: 6000,
    dailyCost: 14,
    perKm: 0.4,
    lifeYears: 8,
  },
};

export const INFRA = {
  /** Road cost per km on flat land (multiplied by terrain difficulty). */
  roadPerCell: 260,
  /** Bridge cost per km over rivers. */
  bridgePerCell: 2600,
  /** Selling a vehicle returns this share of its book value. */
  vehicleResale: 0.5,
};
