'use strict';

const databases = require('../databases.js');

const settings = databases.getDatabase('settings');

function getPunishment(val) {
	switch (val) {
	case 1:
	case 2:
		return 'warn';
	case 3:
	case 4:
		return 'mute';
	case 5:
		return 'hourmute';
	default:
		return 'roomban';
	}
}

let punishments = {};
let mutes = {};
let muteTimers = {};

function punish(userid, ips, room, val, msg) {
	if (!punishments[room]) punishments[room] = {};
	if (!ips) ips = [userid];
	let max = 0;

	for (let i = 0; i < ips.length; i++) {
		max = val;
		if (ips[i] in punishments[room]) {
			punishments[room][ips[i]] += val;
			if (punishments[room][ips[i]] > max) max = punishments[room][ips[i]];
		} else {
			punishments[room][ips[i]] = val;
		}
		setTimeout(() => {
			punishments[room][ips[i]] -= val;
			if (!punishments[room][ips[i]]) delete punishments[room][ips[i]];
		}, 1000 * 60 * 15);
	}

	if (max === 1) {
		Connection.send(room + '|' + userid + ', ' + msg);
	} else {
		Connection.send(room + '|/' + getPunishment(max) + ' ' + userid + ', Bot moderation: ' + msg);
	}

	if (max >= 3 && Config.checkIps) {
		if (!mutes[userid]) mutes[userid] = [];
		if (!muteTimers[userid]) muteTimers[userid] = {};
		if (mutes[userid].includes(room)) {
			clearTimeout(muteTimers[userid][room]);
		} else {
			mutes[userid].push(room);
		}
		if (mutes[userid].length >= 3) {
			Connection.send('staff|/l ' + userid + ', Bot moderation: Breaking chat rules in multiple rooms.');
			Connection.send('staff|/modnote ' + userid + ' was locked for breaking chat rules in the following rooms: ' + mutes[userid].join(', '));
			delete mutes[userid];
			for (let j in muteTimers[userid]) {
				clearTimeout(muteTimers[userid][j]);
			}
			delete muteTimers[userid];
		} else {
			muteTimers[userid][room] = setTimeout(() => {
				delete muteTimers[userid][room];
				mutes[userid].splice(mutes[userid].indexOf(room), 1);
				if (!mutes[userid].length) delete mutes[userid];
			}, 1000 * 60 * 15);
		}
	}
}

let buffers = {};
let timers = {};

function addBuffer(userid, room, message) {
	if (!buffers[room]) buffers[room] = [];
	buffers[room].push([userid, message]);
	if (buffers[room].length > 7) buffers[room].splice(0, 1);
	if (timers[room]) clearTimeout(timers[room]);
	timers[room] = setTimeout(() => buffers[room] = [], 1000 * 3);
}

module.exports = {
	options: ['disablemoderation', 'allowbold', 'allowcaps', 'allowstretching', 'allowflooding'],

	analyzer: {
		parser(room, message, userstr) {
			if (settings[room] && settings[room].options.includes('disablemoderation')) return;
			if (userstr[0] !== ' ') return;

			let userid = toId(userstr);

			if (!(settings[room] && settings[room].options.includes('allowflooding'))) {
				addBuffer(userid, room, message);

				let msgs = 0;
				let identical = 0;

				for (let i = 0; i < buffers[room].length; i++) {
					if (buffers[room][i][0] === userid) {
						msgs++;
						if (buffers[room][i][1] === message) identical++;
					}
				}

				if (msgs >= 5 || identical >= 3) {
					if (Config.checkIps) {
						Handler.checkIp(userid, (userid, ips) => {
							punish(userid, ips, room, 2, 'Do not flood the chat.');
						});
					} else {
						punish(userid, [userid], room, 2, 'Do not flood the chat.');
					}
					return;
				}
			}

			if (!(settings[room] && settings[room].options.includes('allowbold'))) {
				let boldString = message.match(/\*\*([^< ](?:[^<]*?[^< ])??)\*\*/g);
				if (boldString) {
					let len = toId(message).length;
					let boldLen = boldString.reduce((prev, cur) => prev + cur.length, 0);
					if (boldLen >= 0.8 * len) {
						if (Config.checkIps) {
							Handler.checkIp(userid, (userid, ips) => {
								punish(userid, ips, room, 1, 'Do not abuse bold.');
							});
						} else {
							punish(userid, [userid], room, 1, 'Do not abuse bold.');
						}
						return;
					} 
				}
			}

			// Moderation for caps and stretching copied from boTTT.
			if (!(settings[room] && settings[room].options.includes('allowcaps'))) {
				let capsString = message.replace(/[^A-Za-z]/g, '').match(/[A-Z]/g);
				let len = toId(message).length;

				if (len >= 10 && capsString && (capsString.length / len) >= 0.8) {
					if (Config.checkIps) {
						Handler.checkIp(userid, (userid, ips) => {
							punish(userid, ips, room, 1, 'Do not abuse caps.');
						});
					} else {
						punish(userid, [userid], room, 1, 'Do not abuse caps.');
					}
					return;
				}
			}

			if (!(settings[room] && settings[room].options.includes('allowstretching'))) {
				let stretchString = message.replace(/ {2,}/g, ' ');

				if (/(.)\1{7,}/gi.test(stretchString) || (/(..+)\1{4,}/gi.test(stretchString) && !/(\d+\/)+/gi.test(stretchString))) {
					if (Config.checkIps) {
						Handler.checkIp(userid, (userid, ips) => {
							punish(userid, ips, room, 1, 'Do not stretch.');
						});
					} else {
						punish(userid, [userid], room, 1, 'Do not stretch.');
					}
					return;
				}
			}
		},
	},
};
