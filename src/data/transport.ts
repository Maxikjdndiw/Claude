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
  train: {
    id: 'train',
    name: 'Freight train',
    mode: 'rail',
    capacity: 80,
    speed: 28,
    price: 48000,
    dailyCost: 45,
    perKm: 0.9,
    lifeYears: 25,
  },
  ship: {
    id: 'ship',
    name: 'Cargo ship',
    mode: 'sea',
    capacity: 150,
    speed: 20,
    price: 70000,
    dailyCost: 70,
    perKm: 0.6,
    lifeYears: 25,
  },
};

/** Vehicle used on each network. */
export const MODE_VEHICLE: Record<'road' | 'rail' | 'sea', string> = { road: 'truck', rail: 'train', sea: 'ship' };

export const INFRA = {
  /** Road cost per km on flat land (multiplied by terrain difficulty). */
  roadPerCell: 260,
  /** Bridge cost per km over rivers. */
  bridgePerCell: 2600,
  /** Railway track per km (flat land) and per km of rail bridge. */
  railPerCell: 1300,
  railBridgePerCell: 7000,
  /** Survey a 12 km radius for hidden deposits. */
  surveyCost: 9000,
  surveyRadius: 12,
  /** Selling a vehicle returns this share of its book value. */
  vehicleResale: 0.5,
};
