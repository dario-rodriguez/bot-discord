import axios, { AxiosResponse } from 'axios';
import cheerio from 'cheerio';
import { DateTime, DurationObject } from 'luxon';
import { Observable, of, timer } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { IRaid } from 'src/types/types';
import { respawn } from '../data/respawn';

function stringToDuration(input: string): DurationObject {
  if (input.endsWith('h')) {
    return { hours: +input.substring(0, input.length - 1) };
  }
  if (input.endsWith('m')) {
    return { minutes: +input.substring(0, input.length - 1) };
  }
  return {};
}

export function updateRaid(elem: IRaid, actualRaids: { [key: string]: IRaid }): void {
  if (respawn[elem.raid] === undefined) {
    return;
  }

  if (!actualRaids.hasOwnProperty(elem.raid)) {
    actualRaids[elem.raid] = {
      ...elem,
      respawnTime:
        elem.deadTime &&
        elem.deadTime
          .plus(stringToDuration(respawn[elem.raid]!.fixed))
          .minus(stringToDuration(respawn[elem.raid]!.random)),
      notified: true,
      windowNotified: false,
    };
  } else {
    if (actualRaids[elem.raid]!.alive !== elem.alive) {
      actualRaids[elem.raid]!.alive = elem.alive;
      actualRaids[elem.raid]!.notified = false;
      actualRaids[elem.raid]!.windowNotified = false;
      if (elem.alive) {
        actualRaids[elem.raid]!.deadTime = undefined;
        actualRaids[elem.raid]!.respawnTime = undefined;
      }
      console.log(actualRaids[elem.raid]);
    }
    if (+(actualRaids[elem.raid]?.deadTime || 0) !== +(elem.deadTime || 0)) {
      actualRaids[elem.raid]!.deadTime = elem.deadTime;
      actualRaids[elem.raid]!.notified = false;
      actualRaids[elem.raid]!.windowNotified = false;
      if (actualRaids[elem.raid]!.deadTime != undefined) {
        actualRaids[elem.raid]!.respawnTime =
          elem.deadTime &&
          elem.deadTime
            .plus(stringToDuration(respawn[elem.raid]!.fixed))
            .minus(stringToDuration(respawn[elem.raid]!.random));
      } else {
        actualRaids[elem.raid]!.respawnTime = undefined;
      }
    }
  }
}

const raidList$: Observable<IRaid[]> = new Observable<AxiosResponse<string>>(subs => {
  axios
    .create()
    .get('https://www.l2lion.com/?page=boss')
    .then(res => {
      subs.next(res);
      subs.complete();
    })
    .catch(err => {
      subs.error(err);
    });
}).pipe(
  map(result => {
    const html = cheerio.load(result.data);
    const raidList: IRaid[] = [];
    html('.page table tr').each((_, elem) => {
      const raid = html(elem).children('td');
      const statusText = html(raid[1]).text();
      if (['Dead', 'Morto', 'Alive', 'Vivo'].includes(statusText)) {
        raidList.push({
          raid: html(raid[0]).text(),
          alive: statusText != 'Dead' && statusText != 'Morto',
          deadTime:
            html(raid[1]).text() != 'Dead' && html(raid[1]).text() != 'Morto' && html(raid[2]).text().trim()
              ? undefined
              : DateTime.fromFormat(html(raid[2]).text() + ' -0300', 'dd/MM/yyyy HH:mm ZZZ'),
        });
      }
    });

    return raidList;
  }),
);

export const raidTimer$ = timer(15000, 20000).pipe(
  tap(console.log),
  switchMap(() => raidList$),
  catchError(() => of([])),
);
