import * as discord from 'discord.js';
import { DateTime } from 'luxon';
import say from 'say';
import { respawn } from './data/respawn';
import { IRaid } from './types/types';
import { raidTimer$, updateRaid } from './utils/raid-utils';

const client = new discord.Client();
const DATE_FORMAT = 'dd-MM-yyyy HH:mm';
let connection: discord.VoiceConnection | undefined;
const voiceNotifications: string[] = [];
let minLevel: number = 70;
let maxLevel: number = 90;

const actualRaids: { [key: string]: IRaid } = {};

client.login('ODI0NzAwMjY5NzM2NjI0MTk5.YFzL-g.eMNxZVI5J-aLT1HxW6IKcR3x1oE');
client.on('ready', async function () {
  const channel: discord.VoiceChannel = client.channels.cache.find(
    ch => ch instanceof discord.VoiceChannel && ch.name == 'General',
  ) as discord.VoiceChannel;
  if (!channel) return;
  channel.join().then(con => {
    connection = con;
  });
});

function sortRaids(a: IRaid, b: IRaid): number {
  if (a.alive && b.alive) {
    return 0;
  }
  if (a.alive) {
    return -1;
  }
  if (b.alive) {
    return 1;
  }
  if (a.respawnTime!.equals(b.respawnTime!)) {
    return 0;
  }
  if (a.respawnTime! < b.respawnTime!) {
    return -1;
  }
  return 1;
}

function sendMessage(
  channel: discord.TextChannel,
  title: string,
  color: discord.ColorResolvable,
  description: string,
): Promise<discord.Message> | undefined {
  const embed = new discord.MessageEmbed().setTitle(title).setColor(color).setDescription(description);

  if (channel) {
    return channel.send(embed);
  }

  return undefined;
}

function filterRaids(raid: IRaid) {
  return (
    raid.raid &&
    respawn[raid.raid] !== undefined &&
    respawn[raid.raid]!.level >= minLevel &&
    respawn[raid.raid]!.level <= maxLevel
  );
}

client.on('message', async message => {
  if (message.content === '!entra puto') {
    if (message.member!.voice.channel) {
      connection = await message.member!.voice.channel.join();
    } else {
      message.reply('Entra primero en un chat de voz, PUTO!');
    }
  }
  if (message.content === '!vete a la puta mierda') {
    if (connection) {
      connection.channel.leave();
      connection = undefined;
    }
  }
  if (message.content.startsWith('!setMaxLevel')) {
    const parts = message.content.split(' ');
    if (parts.length > 1) {
      maxLevel = +parts[1]!;
    }
  }
  if (message.content.startsWith('!setMinLevel')) {
    const parts = message.content.split(' ');
    if (parts.length > 1) {
      minLevel = +parts[1]!;
    }
  }
  if (message.content.startsWith('!raidlist')) {
    let text = '';
    Object.values(actualRaids)
      .filter(filterRaids)
      .sort(sortRaids)
      .forEach(raid => {
        const textToAdd = raid.raid + ': ' + (raid.respawnTime?.toFormat(DATE_FORMAT) || 'vivo') + '\n';
        if ((text + textToAdd).length > 2000) {
          sendMessage(message.channel as discord.TextChannel, 'Raid List', 0x00ff00, text);
          text = '';
        }
        text += textToAdd;
      });
    sendMessage(message.channel as discord.TextChannel, 'Raid List', 0x00ff00, text);
  }
});

function sayExportAsync(text: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    say.export(text, 'Monica', 1, './message.wav', err => {
      if (err) {
        console.log(err);
        reject(false);
      }

      resolve(true);
    });
  });
}

function playAsync(file: string) {
  return new Promise(resolve => {
    if (connection) {
      const dispacher = connection.play(file);
      dispacher.on('finish', () => {
        resolve(true);
      });

      dispacher.on('error', err => {
        console.log(err);
        resolve(false);
      });
    } else {
      resolve(false);
    }
  });
}

async function sendVoiceNotifications(): Promise<void> {
  while (voiceNotifications.length > 0) {
    const textMessage = voiceNotifications.shift();
    const result = await sayExportAsync(textMessage!);
    if (result) {
      await playAsync('./message.wav');
    }
  }

  setTimeout(() => {
    sendVoiceNotifications();
  }, 5000);
}

sendVoiceNotifications();

raidTimer$.subscribe({
  next: elems =>
    elems.forEach(elem => {
      if (respawn[elem.raid] == undefined) {
        return;
      }
      updateRaid(elem, actualRaids);
      if (filterRaids(elem)) {
        const actualRaid = actualRaids[elem.raid]!;
        const channel: discord.TextChannel = client.channels.cache.find(
          ch => ch instanceof discord.TextChannel && ch.name == 'raid-respawn',
        ) as discord.TextChannel;
        if (!actualRaid.windowNotified && !actualRaid.alive && DateTime.local() > actualRaid.respawnTime!) {
          sendMessage(
            channel,
            'Un raid esta en respawn!',
            0xffff00,
            `El raid ${actualRaid.raid} acaba de entrar en la ventana de respawn. Random: ${
              +respawn[actualRaid.raid]?.random.substring(0, respawn[actualRaid.raid]!.random.length - 1)! * 2 +
              respawn[actualRaid.raid]!.random.substring(respawn[actualRaid.raid]!.random.length - 1)
            }!`,
          );
          actualRaid.windowNotified = true;
        }
        if (!actualRaid.notified) {
          if (actualRaid.alive) {
            sendMessage(channel, 'Un raid aparecio!', 0x00ff00, `El raid ${actualRaid.raid} acaba de aparecer!!`);
            voiceNotifications.push(
              `El raid ${actualRaid.raid} acaba de aparecer! Es nivel ${respawn[actualRaid.raid]!.level}`,
            );
            sendVoiceNotifications();
          } else {
            sendMessage(
              channel,
              'Un raid murio! :(',
              0xff0000,
              `El raid ${
                actualRaid.raid
              } acaba de morir. El proximo respawn empezara: ${actualRaid.respawnTime?.toFormat(DATE_FORMAT)} + ${
                +respawn[actualRaid.raid]?.random.substring(0, respawn[actualRaid.raid]!.random.length - 1)! * 2 +
                respawn[actualRaid.raid]!.random.substring(respawn[actualRaid.raid]!.random.length - 1)
              }`,
            );
          }

          actualRaid.notified = true;
        }
      }
    }),
  error: error => console.log(error),
});
