define(
  'mapObjectsDictionary', 
  ['underscore', 'backbone'], 
  function(_, Backbone) {

  'use strict'

  // How many seconds we show object on map after we think it disappears.
  var defaultObjectTimeout = 300;
  var defaultOpacity = .6;
  var defaultColors = [
    '#236326', '#29762d', '#2f8934', '#359d3b', '#3bb042', '#44c04b', '#57c75d', '#6ace6f', '#7cd582', '#8fdb94', // Green
    '#615f22', '#747128', '#87842f', '#9b9735', '#aeaa3b', '#c0bb43', '#c7c355', '#ceca68', '#d4d17b', '#dbd88e', // Yellow
    '#2d737f', '#338592', '#3996a6', '#3fa8b9', '#4fb3c3', '#61bbca', '#74c4d1', '#87ccd8', '#9ad5de', '#addde5', // Blue,
    '#562397', '#6227ad', '#6d2bc2', '#7a34d2', '#8749d7', '#955ddc', '#a372e1', '#b186e6', '#be9beb', '#ccb0ef', // Violet
    '#af5b28', '#c4662c', '#d27238', '#d7814c', '#dc8f60', '#e19e75', '#e6ad8a', '#ebbb9e', '#efcab3', '#f4d9c8', // Orange-ish
  ];

  /*
  * Gets random color from defaultColors list, example '#236326'.
  */ 
  var getRandomColor = function() {
    return defaultColors[Math.floor(Math.random() * defaultColors.length)];
  };

  /*
  * Generate title string from object's fields. 
  * @param obj - object.
  * 
  * For example if your obj is { a: '1', b: '2' } this 
  * method will generate P
  */ 
  function generateTitle(obj) {
    var title = '';

    if (obj) {  
      for (var field in obj) {
        if (obj.hasOwnProperty(field)) {
          if (title !== '') {
            title += ', ';
          }
          title += field + ': ' + obj[field];
        }
      }
    } 

    return title;
  };

  /*
  * Gets a value indicating whether this point still in default object timeout limit.
  */
  function inTimeoutLimit(currentTime, point) {
    return Math.abs(currentTime - point.ts, 0) <= defaultObjectTimeout;
  }

  /*
  * Class represents each individual object on map. 
  * It stores all points and knows how to travel between them on map.
  */
  var MapObject = Backbone.Model.extend({

    /*
    * Model default values.
    */ 
    defaults: function() {
      return {
        title: '',
        obj: {},
        points: [], // points ordered by ts asc 
        showObject: true,
        showRoute: false,
        color: getRandomColor(),
        realtimeWindow: 300, // Window of storing data
        modelId: ''
      };
    },

    /*
    * Backbone initialize method.
    */
    initialize: function() {

      // When we hide object we trigger event that we removed current position
      this.on('change:showObject', function() {
        if (!this.showObject()) {
          this.clearPos();
        }
      }.bind(this));

      this.set('title', this.get('title') || generateTitle(this.get('obj')) || 'unknown');
      this.map = this.get('map');
      this.marker = null;
      this.polyline = null;
    },

    /*
    * Add new point for object,
    * @param point - should be in format 
    *               { ts: [float], lat: [float], lon: [float] }
    *
    */ 
    add: function(point) {
      if (!point 
        || !_.isNumber(point.ts)
        || !_.isNumber(point.lat)
        || !_.isNumber(point.lon)) {
        throw 'Argument exception. Invalid point format';
      }
      var points = this.getPoints();
      if (_.last(points) && _.last(points).ts > point.ts) {
        throw 'We expect to see all points to be added to desc order by timestamp';
      }
      points.push(point);
      if (this.showRoute()) {
        if (this.polyline) {
          this.polyline.getPath().push(new google.maps.LatLng(point.lat, point.lon));
        } else {
          this.showRoute(true);
        }
      }
    },

    /*
    * Place object on map in current time.
    * @param currentTime - timestamp for which we want to calculate position.
    * @param realtime - in case of realtime object always show latest known position
    *                   for time specified by default value.
    *
    * Current method calculates position and set it as backbone model field `pos`.
    */
    calculatePos: function(currentTime, realtime, timeWindow) {
      if (this.showObject()) {
        // Trying to find point 
        var points = this.getPoints();

        var lat, lon;

        if (timeWindow) {
          // At first let's remove all old points.
          var deadline = currentTime - timeWindow;
          var firstPoint = _.first(points);
          while (firstPoint && firstPoint.ts < deadline) {
            if (points.length === 1 
              && inTimeoutLimit(currentTime, _.first(points))) {
              break;
            }
            firstPoint = points.shift();
            if (this.polyline) {
              this.polyline.getPath().removeAt(0);
            }
          }
        }

        if (realtime) {
          var lastPoint = _.last(points);
          if (lastPoint) {
            lat = lastPoint.lat;
            lon = lastPoint.lon;
          }
        } else {
          var nextPointIndex = -1;
          while ((++nextPointIndex) < points.length) {
            if (points[nextPointIndex].ts > currentTime) {
              break;
            }
          }

          if (nextPointIndex !== 0 && nextPointIndex < points.length) {
            // Let's find position of current object and place it on map
            var currentPoint = points[nextPointIndex - 1];
            var nextPoint = points[nextPointIndex];
            var p = (currentTime - currentPoint.ts)/(nextPoint.ts - currentPoint.ts);
            lat = currentPoint.lat + (nextPoint.lat - currentPoint.lat) * p;
            lon = currentPoint.lon + (nextPoint.lon - currentPoint.lon) * p;
          }
        }

        if (lat && lon) {
          if (this.marker) {
            this.marker.setPosition(new google.maps.LatLng(lat, lon));
          } else {
            this.marker = this.map.addMarker({
                lat: lat,
                lng: lon,
                title: this.get('title'),
                zIndex: 1,
                icon: {
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 4,
                  strokeColor: this.get('color'),
                  strokeWeight: 4,
                  strokeOpacity: 1
                }
            });
          }
        } else {
          // Current object does not have points in this time
          this.clearPos();
        }
      } else {
        this.clearPos();
      }
    },

    /*
    * Remove marker from map.
    *
    * Method invoke `unset` for field `pos`.
    */
    clearPos: function() {
      if (this.marker) {
        this.marker.setMap(null);
        this.marker = null;
      }
    },

    /*
    * Toggle current state of show route (field `showRoute`).
    */
    toggleShowRoute: function() {
      this.showRoute(!this.showRoute());
    },

    /*
    * Toggle current state of show object (field `showObject`).
    */
    toggleShowObject: function() {
      this.showObject(!this.showObject());
    },

    /*
    * Gets or sets the show object value.
    * @param value - if not undefined - set value to showObject.
    */ 
    showObject: function(value) {
      if (!_.isUndefined(value)) {
        this.set({'showObject': value});

        if (!value) {
          this.clearPos();
        }
      }
      return this.get('showObject');
    },

    /*
    * Gets or sets the show object value.
    * @param value - if not undefined - set value to showRoute.
    */ 
    showRoute: function(value) {
      if (!_.isUndefined(value)) {
        this.set({'showRoute': value});

        if (value) {
          if (!this.polyline) {
            var path = _.map(this.getPoints(), function(p) {
              return [p.lat, p.lon];
            });

            path.reverse();

            this.polyline = this.map.drawPolyline({
              path: path,
              strokeColor: this.get('color'),
              strokeOpacity: defaultOpacity,
              strokeWeight: 4
            });
          }
        } else {
          if (this.polyline) {
            this.polyline.setMap(null);
            this.polyline = null;
          }
        }
      }
      return this.get('showRoute');
    },

    /*
    * Gets points array.
    */
    getPoints: function() {
      return this.get('points');
    },

    /*
    * Highlight object on the map. 
    */
    highlightObject: function() {
      if (!this.showRoute()) this.showRoute(true);
      if (!this.showObject()) this.showObject(true);

      // Auto zoom to show route and marker
      var bounds = new google.maps.LatLngBounds();
      _.each(this.getPoints(), function(point) {
        bounds.extend(new google.maps.LatLng(point.lat, point.lon))
      });
      this.map.fitBounds(bounds);

      // Highlight object
      var animation = {step: 0};
      $(animation).animate(
          { step: 2 },
          {
            duration: 1000,
            easing: 'linear',
            start: function() {
              if (this.polyline) this.polyline.setOptions({ zIndex: 100 });
              if (this.marker) {
                this.marker.setZIndex(100);
                this.marker.setAnimation(google.maps.Animation.BOUNCE);
              }
            }.bind(this),
            progress: function() {
              if (this.polyline) {
                var step = (animation.step - Math.floor(animation.step));
                if (step === 1 || step === 5) {
                  step *= .4;
                } else {
                  step *= .8;
                }
                if (step % 2 !== 0) {
                  step = 1 - step;
                }
                this.polyline.setOptions({strokeOpacity:step});
              }
            }.bind(this),
            complete: function() {
              if (this.polyline) {
                this.polyline.setOptions({ strokeOpacity:defaultOpacity });
              }
              if (this.polyline) this.polyline.setOptions({ zIndex: 1 , strokeOpacity:defaultOpacity });
              if (this.marker) {
                this.marker.setZIndex(1);
                this.marker.setAnimation(null);
              }
            }.bind(this)
          })
      ;
    },

    /*
    * Gets a value indicating whether this object does not have any points. 
    */ 
    isEmpty: function() {
      return _.isEmpty(this.getPoints());
    },

    /*
    * Gets an unique identified for this object.
    */
    modelId: function() {
      return this.get('modelId');
    }
  });

  /*
  * Dictionary stores all travel models.
  *
  * To initialize this dictionary you need to set { map: [Gmaps object] };
  * 
  * Backbone custom events:
  * add - new MapObject has been added.
  * remove - object has been removed.
  * reset - all elements are going to be removed.
  */
  var MapObjectsDictionary = Backbone.Model.extend({

    defaults: {
      showAllObjects: true,
      showAllRoutes: true
    },

    /*
    * Backbone initialize method.
    */
    initialize: function() {
      this.models = {};
      this.map = this.get('map');
      if (!this.map) throw 'Map object should be set to initialize dictionary';
    },

    /*
    * Add new data for dictionary.
    * @param obj - map object. Fields of this object defines unique objects.
    * @param point - new point for object specified with fields.
    * @return - MapObject value.
    *
    * Method generates id based on fields and create new MapObject element if dictionary
    * does not have value by generated id, otherwise it adds new point to existing MapObject.
    *
    * After first 100 objects this method sets `showObject` to `false` for next objects.
    */
    addData: function(obj, point) {
      var id = JSON.stringify(obj);

      var model = null;

      if (this.models.hasOwnProperty(id)) {
        model = this.models[id];
      } else {
        model = new MapObject({ 
                        obj: obj, 
                        map: this.map,
                        showObject: this.showAllObjects(),
                        showRoute: this.showAllRoutes(),
                        modelId: id
                     });
        this.models[id] = model;
        this.trigger('add', model);
        model
        .on('change:showObject', function(model, showObject) {
          if (this.showAllObjects() && !showObject) {
            this.showAllObjects(false, true /* silent */);
          }
        }.bind(this))
        .on('change:showRoute', function(model, showRoute) {
          if (this.showAllRoutes() && !showRoute) {
            this.showAllRoutes(false, true /* silent */);
          }
        }.bind(this));
      }

      model.add(point);

      return model;
    },

    /*
    * Remove all objects from dictionary.
    */
    reset: function() {
      this.trigger('reset');
      this.each(function(model, id) {
        model.off();
        model.clearPos();
        model.showRoute(false);
        this.trigger('remove', model);
        delete this.models[id];
      }.bind(this));
    },

    /*
    * Invoke action for each object in dictionary.
    * @param action - function which will be invoked with two arguments model, generated_id.
    */ 
    each: function(action) {
      if (!_.isFunction(action)) {
        throw 'Argument exception. Action is not a function.';
      }
      for (var id in this.models) {
        if (this.models.hasOwnProperty(id)) {
          action(this.models[id], id);
        }
      }
    },

    /*
    * Gets a value indicating whether all objects should be be visible.
    */ 
    showAllObjects: function(value, silent) {
      if (!_.isUndefined(value)) {
        var oldValue = this.get('showAllObjects');

        this.set('showAllObjects', value);

        if (oldValue !== value && !silent) {
          this.each(function(model) {
            model.showObject(value);
          });
        }
      }

      return this.get('showAllObjects');
    },

    /*
    * Gets a value indicating whether all objects routes should be be visible.
    */ 
    showAllRoutes: function(value, silent) {
      if (!_.isUndefined(value)) {
        var oldValue = this.get('showAllRoutes');

        this.set('showAllRoutes', value);

        if (oldValue !== value && !silent) {
          this.each(function(model) {
            model.showRoute(value);
          });
        }
      }

      return this.get('showAllRoutes');
    },

    /*
    * Clear all empty objects from collection.
    */
    clearEmptyObjects: function() {
      this.each(function(model, id) {
        if (model.isEmpty()) {
          model.off();
          model.clearPos();
          model.showRoute(false);
          this.trigger('remove', model);
          delete this.models[id];
        }
      }.bind(this));
    }
  });

  // Require export (MapObjectsDictionary constructor)
  return MapObjectsDictionary;
});