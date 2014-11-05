// The Tactician
// Thinks deep into the future, weighing all options carefully before choosing a course of action.

var DIAMOND_MINE_CAPTURE_DAMAGE = 20;
var HERO_ATTACK_DAMAGE = 20;
var HERO_FOCUSED_ATTACK_DAMAGE = 10;
var HEALTH_WELL_HEAL_AMOUNT = 30;
var HERO_HEAL_AMOUNT = 40;

var DIRECTIONS = ['North', 'East', 'South', 'West', 'Stay'];
var MAX_DEPTH = 4;
var MAX_ENEMY_DEPTH = 2;

var GOAL_PROGRESSION_SCORE = 25; // Score for steps in the direction of our established strategic goal

var Safe_Health_Threshold = 50;
var Base_Health_Threshold = 30;

// Gives a score (higher==better) for a given Status object.
// Different Tactics could be defined by changing the weights
function calculateStatusScore(status) {
	'use strict';
	var totalScore = 0;
	// Win > alive > killCount > minesCaptured > healthGiven > damageDone
	if (status.health <= 0) {
		return -Infinity;
	}
	totalScore += (status.health > Safe_Health_Threshold ? 15 : 0); // 65 if over the safe level
	totalScore += (status.health > Base_Health_Threshold ? 50 : 0); // 50 if over the base level
																	// 0 if under or at the base level
	totalScore += status.killCount * 200;					// 200 per kill
	totalScore += status.livesSaved * 150;					// 150 per life saved
	totalScore += status.minesCaptured * 50;  				// 50 per mine
	totalScore += status.damageDone;						// 10~30 per attack
	totalScore += Math.max(status.healthGiven-15,0); 		// 0~25 per heal
	totalScore += status.gravesRobbed * 5;					// Minor goal of getting boned
	// Don't forget that GOAL_PROGRESSION_SCORE is added to moves in move function
	return totalScore;
}

// This function gives our hero a high level motivation, where the rest of the scoring mechanism
// are very low, tactical level. The direction returned by this function is used to add GOAL_PROGRESSION_SCORE
// to the calculatedStatusScore.
function directionToOverallStrategy(helpers, board, status) {
	var NearestEnemy = function(enemyTile) {return enemyTile.type === 'Hero' && enemyTile.team !== status.team;};
	var NearestHealthWell = function(enemyTile) {return enemyTile.type === 'HealthWell';};
	var strategy = NearestEnemy;
	if (status.health < Safe_Health_Threshold) {
		strategy = NearestHealthWell;
	}
	
	var pathInfoObject = helpers.findNearestObjectDirectionAndDistance(board, status, strategy);
  return pathInfoObject.direction;
}



// Finds the score of a given move by determining what will happen
// when the hero attempts to move in the given direction. The score is recorded
// and then added to the best of all possible scores should the hero attempt another
// move from that new location/state by calling this function recursively.
// Scores are kept relevent by dividing the score by the depth, since things that
// would require several steps to complete are less probably going to actually happen.
// TODO: Improve the future prediction by updating the other heros on the board,
// making a best-guess for what each of them will do. (Maybe use this function, with
// a max depth of just 1.)
function evaluateMoveToPosition(helpers, gameData, startingStatus, direction, depth) {
	'use strict';
	// Gets the tile at the location that the hero wants to go to
	var board = gameData.board;
	var status = new Status(startingStatus);
	var tile = (direction !== 'Stay')?helpers.getTileNearby(board, status.distanceFromTop, status.distanceFromLeft, direction):board.tiles[status.distanceFromTop][status.distanceFromLeft];
	var d = +depth + 1;
	var action = '';
	var heroMoved = false;
	var adjacentEnemies, i;
	

	// Quit recursion if we hit a hard stop
	if (d === MAX_DEPTH || startingStatus.health <= 0 || tile === false) {
		return 0;
	}

	//console.log(d, direction)
	if (direction === 'Stay') {
		action = 'Stay';

	} else {
		// Determine results of the move
		if (tile.type === 'Unoccupied') {
			status.distanceFromTop = tile.distanceFromTop;
			status.distanceFromLeft = tile.distanceFromLeft;
			action = 'Walk';
			heroMoved = true;

		} else if (tile.subType === 'Bones') {
			status.gravesRobbed++;
			status.distanceFromTop = tile.distanceFromTop;
			status.distanceFromLeft = tile.distanceFromLeft;
			action = 'Walk';
			heroMoved = true;

		} else if (tile.type === 'DiamondMine') {
			if (!status.minesOwned.hasOwnProperty(tile.id)) {
				status.health -= DIAMOND_MINE_CAPTURE_DAMAGE;
				status.minesCaptured++;
				status.minesOwned[tile.id] = true;
				action = 'ClaimMine';
			} else {
				action = 'ERROR: Attempted to reclaim owned mine';
			}


		} else if (tile.type === 'HealthWell') {
			action = 'Cure ' + (Math.min(status.health + HEALTH_WELL_HEAL_AMOUNT, 100) - status.health);
			status.health += HEALTH_WELL_HEAL_AMOUNT;
			status.health = Math.min(status.health, 100); // Ensure we are accurate about how much healing is done

		} else if (tile.type === 'Hero' && tile.getCode() !== status.code) {
			if (tile.team !== status.team) {
				status.damageDone += HERO_FOCUSED_ATTACK_DAMAGE;
				action = 'Focused';
				if (tile.health <= (HERO_FOCUSED_ATTACK_DAMAGE + HERO_ATTACK_DAMAGE)  && tile.health > HERO_ATTACK_DAMAGE) {
					// Increment kill count gained from the focused attack
					status.killCount++;
					action += ' K';
				}
			} else {
				status.healthGiven += Math.min(HERO_HEAL_AMOUNT + tile.health, 100) - tile.health; // Ensure we are accurate about how much healing is done
				action = 'Heal ' + (Math.min(HERO_HEAL_AMOUNT + tile.health, 100) - tile.health);
				adjacentEnemies = getAdjacentEnemies(helpers, board, tile.distanceFromTop, tile.distanceFromLeft, status.team);
				// Count lives saved as those that are in immediate danger of being attacked and wouldn't survive it
				// TODO: Improve this estimate by looking at enemies that could move and then still do damage to the friend. Ex:
				// Friend is at 70 health and has one neighboring enemy, so healing him now would seem to be less efficient than waiting
				// for him to take more damage. But then two more enemies move in and the adjacent enemy makes a focused attack,
				// killing our friend.
				if (tile.health <= adjacentEnemies * (HERO_FOCUSED_ATTACK_DAMAGE + HERO_ATTACK_DAMAGE)) {
					status.livesSaved++;
					action += 'Save';
				}
			}
		} else if (tile.type === 'Hero' && tile.getCode() === status.code) {
			action = 'Return';
		}
	}

	// Calculate damage and kills to adjacent enemies
	adjacentEnemies = getAdjacentEnemies(helpers, board, status.distanceFromTop, status.distanceFromLeft, status.team);
	status.health -= adjacentEnemies.length * (HERO_ATTACK_DAMAGE + HERO_FOCUSED_ATTACK_DAMAGE);
	status.damageDone += HERO_ATTACK_DAMAGE * adjacentEnemies.length;
	for (i = 0; i < adjacentEnemies.length; ++i) {
		action += 'd';
		if (adjacentEnemies[i].health <= HERO_ATTACK_DAMAGE) {
			status.killCount++;
			action += 'k';
		}
	}

	var scoreForThisStep = Math.floor(status.score(startingStatus) / d * 10) / 10;
	var bestNextStepScore = 0;

	// explore further options if this path is still viable.
	if (scoreForThisStep >= 0) {
		var updatedGameData = gameData;

		// Estimatie enemy actions. This is expensive and inaccurate, so we only do it for some steps 
		if (d <= MAX_ENEMY_DEPTH) {
		//console.log(d, (new Array(d+1)).join('    ') + '*** Estimating Enemy Movements ***')
			var updatedGameData = deepCopy(gameData);
			
		//console.log('Before:');
		//gameData.board.inspect();
		//console.log(d, (new Array(d+1)).join('    ') + status.getCode() + ' Moved ' + direction + ')');

			if (heroMoved) {
				
				swapTiles(updatedGameData.board, 
					updatedGameData.board.tiles[status.distanceFromTop][status.distanceFromLeft],
					updatedGameData.board.tiles[startingStatus.distanceFromTop][startingStatus.distanceFromLeft]
				);
			}
			updateAllOtherHeros(updatedGameData, status.getCode(), helpers);
			
		//console.log('After:');
		//updatedGameData.board.inspect();
		//console.log(d, (new Array(d+1)).join('    ') + '*** Done Estimating ***')
		}

		var nextSteps = {
			North: evaluateMoveToPosition(helpers, updatedGameData, status, 'North', d),
			East: evaluateMoveToPosition(helpers, updatedGameData, status, 'East', d),
			South: evaluateMoveToPosition(helpers, updatedGameData, status, 'South', d),
			West: evaluateMoveToPosition(helpers, updatedGameData, status, 'West', d),
			Stay: evaluateMoveToPosition(helpers, updatedGameData, status, 'Stay', d)
		};

	//console.log(d, (new Array(d+1)).join('    ') + 'scoreForThisStep:', scoreForThisStep);
	//console.log(d, (new Array(d+1)).join('    ') + 'nextSteps.North:', nextSteps.North);
	//console.log(d, (new Array(d+1)).join('    ') + 'nextSteps.East:', nextSteps.East);
	//console.log(d, (new Array(d+1)).join('    ') + 'nextSteps.South:', nextSteps.South);
	//console.log(d, (new Array(d+1)).join('    ') + 'nextSteps.West:', nextSteps.West);
	//console.log(d, (new Array(d+1)).join('    ') + 'nextSteps.Stay:', nextSteps.Stay);
		bestNextStepScore = Math.max(
			nextSteps.North,
			nextSteps.East,
			nextSteps.South,
			nextSteps.West,
			nextSteps.Stay
		);
	} else {
		//console.log(JSON.stringify(status));
		bestNextStepScore = 0;
	}
	return scoreForThisStep + bestNextStepScore;
}




function move(gameData, helpers) {
	'use strict';
	var i = 0;
	var status = new Status(gameData.activeHero);
	var bestScore = -Infinity;
	var bestDirections = [];
	var strategicGoalDirection = directionToOverallStrategy(helpers, gameData.board, status);
	var curScore, direction;
	var dt = Date.now();

	while (i < DIRECTIONS.length) {
		if (DIRECTIONS[i] === 'Stay' || helpers.getTileNearby(gameData.board, status.distanceFromTop, status.distanceFromLeft, DIRECTIONS[i])) {
			curScore = evaluateMoveToPosition(helpers, gameData, status, DIRECTIONS[i], 0);
			curScore += (DIRECTIONS[i] === strategicGoalDirection ? GOAL_PROGRESSION_SCORE : 0);
			console.log('Score for ' + DIRECTIONS[i] + ':', curScore);
			if (curScore > bestScore) {
				bestScore = curScore;
				bestDirections = [DIRECTIONS[i]];
			} else if (curScore === bestScore) {
				bestDirections.push(DIRECTIONS[i]);
			}
		}
		++i;
	}

	// Choose randomly from all the best possible choices
	direction = bestDirections[~~(bestDirections.length * Math.random())];
	console.log('Best directions(' + bestScore.toString().substr(0,3) + '): ' + bestDirections, '+' + strategicGoalDirection, '>>>' + direction);
	console.log('Evaluation took ' + (Date.now() - dt) + 'ms');
	return direction;
}





// Holds the current state of the hero at any given point, with all relevant accumulated actions
function Status(status) {
	'use strict';
	// Simplification of hero's status
	// status parameter may be a Hero object or a Status object
	var self = {};
	self.code = status.code || ((status.getCode !== 'undefined')?status.getCode():'xx');
	self.getCode = function(){ return self.code; };
	self.team = status.team;
	self.distanceFromTop = status.distanceFromTop;
	self.distanceFromLeft = status.distanceFromLeft;
	self.health = status.health;
	self.healthGiven = status.healthGiven;
	self.livesSaved = status.livesSaved || 0;
	self.minesCaptured = status.minesCaptured;
	self.minesOwned = JSON.parse(JSON.stringify(status.minesOwned || {}));
	self.damageDone = status.damageDone;
	self.killCount = status.killCount || (status.heroesKilled?status.heroesKilled.length:0);
	self.gravesRobbed = status.gravesRobbed; // Why do we care?
	self._score = null;
	self.score = function (baseStatus) {
		if (self._score === null) {
			// We want only the score of the delta
			if (baseStatus) {
				self.healthGiven = Math.max(self.healthGiven - baseStatus.healthGiven, 0);
				self.livesSaved = Math.max(self.livesSaved - baseStatus.livesSaved, 0);
				self.minesCaptured = Math.max(self.minesCaptured - baseStatus.minesCaptured, 0);
				self.damageDone = Math.max(self.damageDone - baseStatus.damageDone, 0);
				self.killCount = Math.max(self.killCount - baseStatus.killCount, 0);
				self.gravesRobbed = Math.max(self.gravesRobbed - baseStatus.gravesRobbed, 0);
			}
			self._score = calculateStatusScore(self);
		}
		return self._score;
	};
	return self;
}

function getAdjacentEnemies(helpers, board, distanceFromTop, distanceFromLeft, team) {
	'use strict';
	var n = helpers.getTileNearby(board, distanceFromTop, distanceFromLeft, 'North');
	var e = helpers.getTileNearby(board, distanceFromTop, distanceFromLeft, 'East');
	var s = helpers.getTileNearby(board, distanceFromTop, distanceFromLeft, 'South');
	var w = helpers.getTileNearby(board, distanceFromTop, distanceFromLeft, 'West');
	var adjacent = [];
	if (n.team && n.team !== team) {
		adjacent.push(n);
	}
	if (e.team && e.team !== team) {
		adjacent.push(e);
	}
	if (s.team && s.team !== team) {
		adjacent.push(s);
	}
	if (w.team && w.team !== team) {
		adjacent.push(w);
	}
	return adjacent;
}


function updateAllOtherHeros(gameData, activeHeroCode, helpers) {
	var hero, direction;
	gameData.heroes.forEach(function(hero) {
		if (hero.getCode() !== activeHeroCode && hero.health > 0) {
			direction = getProbableHeroMove(hero, gameData, helpers);
		//console.log('Estimated ' + hero.getCode() + ' moved ' + direction);
			handleHeroMove(gameData.board, hero, direction);
		} else {
		//console.log('Skipping', hero.getCode());
		}
	});
}


// Estimate the likely move of a hero
function getProbableHeroMove(hero, gameData, helpers) {
	'use strict';
	var moves = {North: 0, East: 0, South: 0, West: 0, Stay: 0};
	var i = 0;
	var bestScore = -Infinity;
	var bestDirections = [];
	var direction;

	if (hero.health <= Base_Health_Threshold) {
		// Assume that all heros will prioritize getting healed when very low on health
		direction = helpers.findNearestHealthWell(gameData);
	//console.log('Predicting HealthWell >>>' + direction);
		return direction;
	}

	if (hero.health < Safe_Health_Threshold) {
		moves[helpers.findNearestHealthWell(gameData)] = 1;
	}
	moves[helpers.findNearestTeamMember(gameData) || 'Stay'] += 1; 			// Priests
	moves[helpers.findNearestEnemy(gameData) || 'Stay'] += 1; 				// Unwise Assassins
	moves[helpers.findNearestWeakerEnemy(gameData) || 'Stay'] += 1; 		// Careful Assassins
	moves[helpers.findNearestNonTeamDiamondMine(gameData) || 'Stay'] += 1; 	// Miners
//console.log('predicted move weights: ' + JSON.stringify(moves));
	while (i < DIRECTIONS.length) {
		if (moves[DIRECTIONS[i]] > bestScore) {
			bestScore = moves[DIRECTIONS[i]];
			bestDirections = [DIRECTIONS[i]];
		} else if (moves[DIRECTIONS[i]] === bestScore) {
			bestDirections.push(DIRECTIONS[i]);
		}
		++i;
	}

	// Choose randomly from all the best possible choices
	direction = bestDirections[~~(bestDirections.length * Math.random())];
//console.log(hero.getCode() + ' Predicting(' + bestScore.toString().substr(0,3) + '): ' + bestDirections, '>>>' + direction);
	return direction;

}


function handleHeroMove(board, hero, direction) {
  var tile = board.getTileNearby(hero.distanceFromTop, hero.distanceFromLeft, direction);
  if (!tile) {
  	tile = board.tiles[hero.distanceFromTop][hero.distanceFromLeft];
  }

  if (tile === false) {
	return;
  } else if (tile.type === 'Unoccupied') {
  	swapTiles(board, tile, hero);
  } else if (tile.type === 'DiamondMine') {
	hero.health -= DIAMOND_MINE_CAPTURE_DAMAGE;
	if (hero.health > 0) {
	  tile.owner = hero;
	}
  } else if (tile.type === 'HealthWell') {
	hero.health += HEALTH_WELL_HEAL_AMOUNT;
  } else if (tile.type === 'Hero') {
	if (tile.team !== hero.team) {
	  tile.health -= HERO_FOCUSED_ATTACK_DAMAGE;
	} else {
	  tile.health += HERO_HEAL_AMOUNT;
	}
  }
}

function deepCopy(obj) {
	if(obj === null || typeof(obj) !== 'object'){
		return obj;
	}
	//make sure the returned object has the same prototype as the original
	var ret;
	if (Array.isArray(obj)) {
		ret = [];
		obj.forEach(function (e,i) {
			ret[i] = deepCopy(e);
		});
	} else {
		ret = Object.create(obj.constructor.prototype);
		for(var key in obj){
			ret[key] = deepCopy(obj[key]);
		}
	}
	return ret;
}

function swapTiles(board, a, b) {
	var x = b.distanceFromLeft;
	var y = b.distanceFromTop;
	b.distanceFromTop = a.distanceFromTop;
	b.distanceFromLeft = a.distanceFromLeft;
	a.distanceFromTop = y;
	a.distanceFromLeft = x;
	board.tiles[y][x] = a;
	board.tiles[b.distanceFromTop][b.distanceFromLeft] = b;
}

// Must be the last line
module.exports = move;