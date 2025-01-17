/*
Copyright 2021 The Matrix.org Foundation C.I.C.

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

import { MatrixClient, Room } from "matrix-js-sdk/src/matrix";
import { mocked } from "jest-mock";

import WidgetStore, { IApp } from "../../src/stores/WidgetStore";
import { Container, WidgetLayoutStore } from "../../src/stores/widgets/WidgetLayoutStore";
import { stubClient } from "../test-utils";
import defaultDispatcher from "../../src/dispatcher/dispatcher";

// setup test env values
const roomId = "!room:server";
const mockRoom = <Room>{
    roomId: roomId,
    currentState: {
        getStateEvents: (_l, _x) => {
            return {
                getId: () => "$layoutEventId",
                getContent: () => null,
            };
        },
    },
};

describe("WidgetLayoutStore", () => {
    let client: MatrixClient;
    let store: WidgetLayoutStore;
    let roomUpdateListener: (event: string) => void;
    let mockApps: IApp[];

    beforeEach(() => {
        mockApps = [
            <IApp>{ roomId: roomId, id: "1" },
            <IApp>{ roomId: roomId, id: "2" },
            <IApp>{ roomId: roomId, id: "3" },
            <IApp>{ roomId: roomId, id: "4" },
        ];

        // fake the WidgetStore.instance to just return an object with `getApps`
        jest.spyOn(WidgetStore, "instance", "get").mockReturnValue({
            on: jest.fn(),
            off: jest.fn(),
            getApps: () => mockApps,
        } as unknown as WidgetStore);
    });

    beforeAll(() => {
        // we need to init a client so it does not error, when asking for DeviceStorage handlers (SettingsStore.setValue("Widgets.layout"))
        client = stubClient();

        roomUpdateListener = jest.fn();
        // @ts-ignore bypass private ctor for tests
        store = new WidgetLayoutStore();
        store.addListener(`update_${roomId}`, roomUpdateListener);
    });

    afterAll(() => {
        store.removeListener(`update_${roomId}`, roomUpdateListener);
    });

    it("all widgets should be in the right container by default", () => {
        store.recalculateRoom(mockRoom);
        expect(store.getContainerWidgets(mockRoom, Container.Right).length).toStrictEqual(mockApps.length);
    });

    it("add widget to top container", async () => {
        store.recalculateRoom(mockRoom);
        store.moveToContainer(mockRoom, mockApps[0], Container.Top);
        expect(store.getContainerWidgets(mockRoom, Container.Top)).toStrictEqual([mockApps[0]]);
        expect(store.getContainerHeight(mockRoom, Container.Top)).toBeNull();
    });

    it("add three widgets to top container", async () => {
        store.recalculateRoom(mockRoom);
        store.moveToContainer(mockRoom, mockApps[0], Container.Top);
        store.moveToContainer(mockRoom, mockApps[1], Container.Top);
        store.moveToContainer(mockRoom, mockApps[2], Container.Top);
        expect(new Set(store.getContainerWidgets(mockRoom, Container.Top))).toEqual(
            new Set([mockApps[0], mockApps[1], mockApps[2]]),
        );
    });

    it("cannot add more than three widgets to top container", async () => {
        store.recalculateRoom(mockRoom);
        store.moveToContainer(mockRoom, mockApps[0], Container.Top);
        store.moveToContainer(mockRoom, mockApps[1], Container.Top);
        store.moveToContainer(mockRoom, mockApps[2], Container.Top);
        expect(store.canAddToContainer(mockRoom, Container.Top)).toEqual(false);
    });

    it("remove pins when maximising (other widget)", async () => {
        store.recalculateRoom(mockRoom);
        store.moveToContainer(mockRoom, mockApps[0], Container.Top);
        store.moveToContainer(mockRoom, mockApps[1], Container.Top);
        store.moveToContainer(mockRoom, mockApps[2], Container.Top);
        store.moveToContainer(mockRoom, mockApps[3], Container.Center);
        expect(store.getContainerWidgets(mockRoom, Container.Top)).toEqual([]);
        expect(new Set(store.getContainerWidgets(mockRoom, Container.Right))).toEqual(
            new Set([mockApps[0], mockApps[1], mockApps[2]]),
        );
        expect(store.getContainerWidgets(mockRoom, Container.Center)).toEqual([mockApps[3]]);
    });

    it("remove pins when maximising (one of the pinned widgets)", async () => {
        store.recalculateRoom(mockRoom);
        store.moveToContainer(mockRoom, mockApps[0], Container.Top);
        store.moveToContainer(mockRoom, mockApps[1], Container.Top);
        store.moveToContainer(mockRoom, mockApps[2], Container.Top);
        store.moveToContainer(mockRoom, mockApps[0], Container.Center);
        expect(store.getContainerWidgets(mockRoom, Container.Top)).toEqual([]);
        expect(store.getContainerWidgets(mockRoom, Container.Center)).toEqual([mockApps[0]]);
        expect(new Set(store.getContainerWidgets(mockRoom, Container.Right))).toEqual(
            new Set([mockApps[1], mockApps[2], mockApps[3]]),
        );
    });

    it("remove maximised when pinning (other widget)", async () => {
        store.recalculateRoom(mockRoom);
        store.moveToContainer(mockRoom, mockApps[0], Container.Center);
        store.moveToContainer(mockRoom, mockApps[1], Container.Top);
        expect(store.getContainerWidgets(mockRoom, Container.Top)).toEqual([mockApps[1]]);
        expect(store.getContainerWidgets(mockRoom, Container.Center)).toEqual([]);
        expect(new Set(store.getContainerWidgets(mockRoom, Container.Right))).toEqual(
            new Set([mockApps[2], mockApps[3], mockApps[0]]),
        );
    });

    it("remove maximised when pinning (same widget)", async () => {
        store.recalculateRoom(mockRoom);
        store.moveToContainer(mockRoom, mockApps[0], Container.Center);
        store.moveToContainer(mockRoom, mockApps[0], Container.Top);
        expect(store.getContainerWidgets(mockRoom, Container.Top)).toEqual([mockApps[0]]);
        expect(store.getContainerWidgets(mockRoom, Container.Center)).toEqual([]);
        expect(new Set(store.getContainerWidgets(mockRoom, Container.Right))).toEqual(
            new Set([mockApps[2], mockApps[3], mockApps[1]]),
        );
    });

    it("should recalculate all rooms when the client is ready", async () => {
        mocked(client.getVisibleRooms).mockReturnValue([mockRoom]);
        await store.start();

        expect(roomUpdateListener).toHaveBeenCalled();
        expect(store.getContainerWidgets(mockRoom, Container.Top)).toEqual([mockApps[0]]);
        expect(store.getContainerWidgets(mockRoom, Container.Center)).toEqual([]);
        expect(store.getContainerWidgets(mockRoom, Container.Right)).toEqual([mockApps[1], mockApps[2], mockApps[3]]);
    });

    it("should clear the layout and emit an update if there are no longer apps in the room", () => {
        store.recalculateRoom(mockRoom);
        mocked(roomUpdateListener).mockClear();

        jest.spyOn(WidgetStore, "instance", "get").mockReturnValue(<WidgetStore>(
            ({ getApps: (): IApp[] => [] } as unknown as WidgetStore)
        ));
        store.recalculateRoom(mockRoom);
        expect(roomUpdateListener).toHaveBeenCalled();
        expect(store.getContainerWidgets(mockRoom, Container.Top)).toEqual([]);
        expect(store.getContainerWidgets(mockRoom, Container.Center)).toEqual([]);
        expect(store.getContainerWidgets(mockRoom, Container.Right)).toEqual([]);
    });

    it("should clear the layout if the client is not viable", () => {
        store.recalculateRoom(mockRoom);
        defaultDispatcher.dispatch(
            {
                action: "on_client_not_viable",
            },
            true,
        );

        expect(store.getContainerWidgets(mockRoom, Container.Top)).toEqual([]);
        expect(store.getContainerWidgets(mockRoom, Container.Center)).toEqual([]);
        expect(store.getContainerWidgets(mockRoom, Container.Right)).toEqual([]);
    });

    it("should return the expected resizer distributions", () => {
        // this only works for top widgets
        store.recalculateRoom(mockRoom);
        store.moveToContainer(mockRoom, mockApps[0], Container.Top);
        store.moveToContainer(mockRoom, mockApps[1], Container.Top);
        expect(store.getResizerDistributions(mockRoom, Container.Top)).toEqual(["50.0%"]);
    });

    it("should set and return container height", () => {
        store.recalculateRoom(mockRoom);
        store.moveToContainer(mockRoom, mockApps[0], Container.Top);
        store.moveToContainer(mockRoom, mockApps[1], Container.Top);
        store.setContainerHeight(mockRoom, Container.Top, 23);
        expect(store.getContainerHeight(mockRoom, Container.Top)).toBe(23);
    });

    it("should move a widget within a container", () => {
        store.recalculateRoom(mockRoom);
        store.moveToContainer(mockRoom, mockApps[0], Container.Top);
        store.moveToContainer(mockRoom, mockApps[1], Container.Top);
        store.moveToContainer(mockRoom, mockApps[2], Container.Top);
        expect(store.getContainerWidgets(mockRoom, Container.Top)).toStrictEqual([
            mockApps[0],
            mockApps[1],
            mockApps[2],
        ]);
        store.moveWithinContainer(mockRoom, Container.Top, mockApps[0], 1);
        expect(store.getContainerWidgets(mockRoom, Container.Top)).toStrictEqual([
            mockApps[1],
            mockApps[0],
            mockApps[2],
        ]);
    });

    it("should copy the layout to the room", async () => {
        await store.start();
        store.recalculateRoom(mockRoom);
        store.moveToContainer(mockRoom, mockApps[0], Container.Top);
        store.copyLayoutToRoom(mockRoom);

        expect(mocked(client.sendStateEvent).mock.calls).toMatchInlineSnapshot(`
            [
              [
                "!room:server",
                "io.element.widgets.layout",
                {
                  "widgets": {
                    "1": {
                      "container": "top",
                      "height": 23,
                      "index": 2,
                      "width": 64,
                    },
                    "2": {
                      "container": "top",
                      "height": 23,
                      "index": 0,
                      "width": 10,
                    },
                    "3": {
                      "container": "top",
                      "height": 23,
                      "index": 1,
                      "width": 26,
                    },
                    "4": {
                      "container": "right",
                    },
                  },
                },
                "",
              ],
            ]
        `);
    });
});
