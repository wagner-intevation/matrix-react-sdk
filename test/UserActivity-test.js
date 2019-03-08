/*
Copyright 2019 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import expect from 'expect';
import lolex from 'lolex';
import jest from 'jest-mock';
import EventEmitter from 'events';
import UserActivity from '../src/UserActivity';

class FakeDomEventEmitter extends EventEmitter {
    addEventListener(what, l) {
        this.on(what, l);
    }

    removeEventListener(what, l) {
        this.removeListener(what, l);
    }
};

describe('UserActivity', function() {
    let fakeWindow;
    let fakeDocument;
    let userActivity;
    let clock;

    beforeEach(function() {
        fakeWindow = new FakeDomEventEmitter(),
        fakeDocument = new FakeDomEventEmitter(),
        userActivity = new UserActivity(fakeWindow, fakeDocument);
        userActivity.start();
        clock = lolex.install();
    });

    afterEach(function() {
        userActivity.stop();
        userActivity = null;
        clock.uninstall();
        clock = null;
    });

    it('should return the same shared instance', function() {
        expect(UserActivity.sharedInstance()).toBe(UserActivity.sharedInstance());
    });

    it('should consider user inactive if no activity', function() {
        expect(userActivity.userCurrentlyActive()).toBe(false);
    });

    it('should consider user not passive if no activity', function() {
        expect(userActivity.userCurrentlyPassive()).toBe(false);
    });

    it('should not consider user active after activity if no window focus', function() {
        fakeDocument.hasFocus = jest.fn().mockReturnValue(false);

        userActivity._onUserActivity({});
        expect(userActivity.userCurrentlyActive()).toBe(false);
        expect(userActivity.userCurrentlyPassive()).toBe(false);
    });

    it('should consider user active shortly after activity', function() {
        fakeDocument.hasFocus = jest.fn().mockReturnValue(true);

        userActivity._onUserActivity({});
        expect(userActivity.userCurrentlyActive()).toBe(true);
        expect(userActivity.userCurrentlyPassive()).toBe(true);
        clock.tick(200);
        expect(userActivity.userCurrentlyActive()).toBe(true);
        expect(userActivity.userCurrentlyPassive()).toBe(true);
    });

    it('should consider user not active after 10s of no activity', function() {
        fakeDocument.hasFocus = jest.fn().mockReturnValue(true);

        userActivity._onUserActivity({});
        clock.tick(10000);
        expect(userActivity.userCurrentlyActive()).toBe(false);
    });

    it('should consider user passive after 10s of no activity', function() {
        fakeDocument.hasFocus = jest.fn().mockReturnValue(true);

        userActivity._onUserActivity({});
        clock.tick(10000);
        expect(userActivity.userCurrentlyPassive()).toBe(true);
    });

    it('should not consider user passive after 10s if window un-focused', function() {
        fakeDocument.hasFocus = jest.fn().mockReturnValue(true);

        userActivity._onUserActivity({});
        clock.tick(10000);

        fakeDocument.hasFocus = jest.fn().mockReturnValue(false);
        fakeWindow.emit('blur', {});

        expect(userActivity.userCurrentlyPassive()).toBe(false);
    });

    it('should not consider user passive after 3 mins', function() {
        fakeDocument.hasFocus = jest.fn().mockReturnValue(true);

        userActivity._onUserActivity({});
        clock.tick(3 * 60 * 1000);

        expect(userActivity.userCurrentlyPassive()).toBe(false);
    });

    it('should extend timer on activity', function() {
        fakeDocument.hasFocus = jest.fn().mockReturnValue(true);

        userActivity._onUserActivity({});
        clock.tick(1 * 60 * 1000);
        userActivity._onUserActivity({});
        clock.tick(1 * 60 * 1000);
        userActivity._onUserActivity({});
        clock.tick(1 * 60 * 1000);

        expect(userActivity.userCurrentlyPassive()).toBe(true);
    });
});
