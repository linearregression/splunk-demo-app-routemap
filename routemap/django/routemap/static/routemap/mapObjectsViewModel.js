define(
  'mapObjectsViewModel', 
  ['underscore', 'backbone', 'mapObjectsDictionary'], 
  function(_, Backbone, MapObjectsDictionary) {

  'use strict'

  /*
  * View-Model object for map objects view.
  */
  var MapObjectsViewModel = Backbone.Model.extend({

    /*
    * Default values for view model.
    */
    defaults: {
      graduality: 2,
      speed: 10,
      realtime: true,
      timeWindow: 1800 // 30 minutes
    },

    /*
    * Backbone model initialization.
    */ 
    initialize: function() {
      // Initialize sub-models
      this.map = new GMaps({ div: '#map', lat: 0, lng: 0, zoom: 2 });
      this.collection = new MapObjectsDictionary({ map: this.map });

      this.collection
        .on('add', function(model) {
          model.on(
            'change:showObject', 
            function(model, showObject) {
              if (showObject) {
                model.calculatePos(this.currentTime(), this.realtime(), this.timeWindow());
              }
            }.bind(this));
        }.bind(this))
        .on('remove', function(model) {
          model.clearPos();
        });
    },

    /*
    * Gets or sets current time for view model.
    *
    * Method update each object on map and ask them to recalculate their
    * positions.
    */ 
    currentTime: function(value) {
      if (!_.isUndefined(value)) {
        this.set('currentTime', value);
        this.collection.each(function(obj) {
          if (obj.showObject()) {
            obj.calculatePos(value, this.realtime(), this.timeWindow());
          }
        }.bind(this));
        this.collection.clearEmptyObjects();
      }
      
      return this.get('currentTime');
    },

    /*
    * Gets or sets begin time for view model.
    */ 
    beginTime: function(value) {
      if (!_.isUndefined(value)) {
        this.set('beginTime', value);
      }

      return this.get('beginTime');
    },

    /*
    * Gets or sets end time for view model.
    */ 
    endTime: function(value) {
      if (!_.isUndefined(value)) {
        this.set('endTime', value);
      }

      return this.get('endTime');
    },

    /*
    * Gets or sets if current view is in real-time mode.
    */
    realtime: function(value) {
      if (!_.isUndefined(value)) {
        if (value) {
          this.pause();
        }
        this.set('realtime', value);
      }

      return this.get('realtime');
    },

    /*
    * Gets or sets time window (use it for real-time mode).
    */
    timeWindow: function(value) {
      if (!_.isUndefined(value)) {
        this.set('timeWindow', value);
      }

      return this.get('timeWindow');
    },

    /*
    * Gets or sets playback speed.
    */
    speed: function(value) {
      if (!_.isUndefined(value)) {
        this.set('speed', value);
      }

      return this.get('speed');
    },

    /*
    * Gets or sets playback graduality.
    */
    graduality: function(value) {
      if (!_.isUndefined(value)) {
        this.set('graduality', value);
      }

      return this.get('graduality');
    },

    /*
    * Gets information if view model right now is in playback mode.
    */
    playbackMode: function() {
      return this.has('playInterval');
    },

    /*
    * Add objects on the map. 
    * @param data - array of { obj: [obj fields], point: { ts: [float], lat: [float], lon: [float]}}.
    */
    addDataPoints: function(data) {
      var beginTime = this.has('beginTime') ? this.beginTime() : null;
      var endTime = this.has('endTime') ? this.endTime() : null;
      var currentTime = this.currentTime();
      var realtime = this.realtime();
      _.each(data, function(p) {
        if (!realtime || !currentTime || currentTime < p.point.ts) {
          beginTime = Math.min(p.point.ts, beginTime || p.point.ts);
          endTime = Math.max(p.point.ts, endTime || p.point.ts);
          this.collection.addData(p.obj, p.point);
        }
      }.bind(this));
      if (this.has('timeWindow')) {
        beginTime = Math.max(endTime - this.timeWindow(), beginTime);
      }
      if (beginTime) this.beginTime(beginTime);
      if (endTime) this.endTime(endTime);
    },

    /*
    * Add object on the map. 
    * @param obj - object located on this point.
    * @param point - position of the object in time { ts: [float], lat: [float], lon: [float]}
    */
    addData: function(obj, point) {
      this.beginTime(!this.has('beginTime') ? point.ts : Math.min(point.ts, this.beginTime()));
      this.endTime(!this.has('endTime') ? point.ts : Math.max(point.ts, this.endTime()));
      return this.collection.addData(obj, point);
    },

    /*
    * Remove all tracking objects.
    */ 
    removeAllObjects: function() {
      this.pause();
      this.collection.reset();
      this.unset({currentTime: null, beginTime: null, endTime: null});
    },

    /*
    * Start playback of all objects on map.
    *
    * In case of realtime we just move all system to latest known point in time.
    */
    play: function() {
      if (!this.has('beginTime') || !this.has('endTime') || this.has('playInterval')) {
        // No objects or already in play mode
        return; 
      }

      if (this.realtime()) {
        this.currentTime(this.endTime());
      } else {
        if (!this.has('currentTime')) {
          this.currentTime(this.beginTime());
        }

        this.set('playInterval', setInterval(function() {
          this.currentTime(this.currentTime() + (this.speed() / this.graduality()));
          if (this.currentTime() > this.endTime()) {
            this.pause();
          } 
        }.bind(this), (1000 / this.graduality())));
      }
    }, 

    /*
    * Pause playback.
    */
    pause: function() {
      if (this.has('playInterval')) {
        clearInterval(this.get('playInterval'));
        this.unset('playInterval');
      }
    },

    /*
    * Auto-zoom map to area of selected objects.
    */
    autoZoom: function() {
      // Calculate bounds of all visible objects
      var bounds = new google.maps.LatLngBounds();
      this.collection.each(function(model) {
        if (model.showObject() || model.showRoute()) {
          var points = model.getPoints();
          _.each(points, function(point) {
            bounds.extend(new google.maps.LatLng(point.lat, point.lon))
          });
        }
      });

      this.map.fitBounds(bounds);
    }
  });

  return MapObjectsViewModel;
});