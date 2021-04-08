import { DateTime } from 'luxon';

export interface IRaid {
  raid: string;
  alive: boolean;
  deadTime?: DateTime;
  respawnTime?: DateTime;
  notified?: boolean;
  windowNotified?: boolean;
}
