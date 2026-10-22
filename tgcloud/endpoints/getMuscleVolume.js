import { endpoint } from '../lib/endpoint.js';
import { getMuscleVolume } from '../lib/stats.js';

export default endpoint(getMuscleVolume, { onboarded: true });
