// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import expect = require('expect.js');

import {
  Kernel, KernelMessage, utils, Session
} from '@jupyterlab/services';

import {
  clearSignalData, defineSignal, ISignal
} from 'phosphor/lib/core/signaling';

import {
  Panel
} from 'phosphor/lib/ui/panel';

import {
  CodeMirrorConsoleRenderer
} from '../../../lib/console/codemirror/widget';

import {
  ForeignHandler
} from '../../../lib/console/foreign';

import {
  CodeCellModel, CodeCellWidget
} from '../../../lib/notebook/cells';

import {
  defaultRenderMime
} from '../utils';


const relevantTypes = [
  'execute_input',
  'execute_result',
  'display_data',
  'stream',
  'error',
  'clear_output'
].reduce((acc, val) => {
  acc.add(val);
  return acc;
}, new Set<string>());


class TestHandler extends ForeignHandler {

  readonly injected: ISignal<this, void>;

  readonly received: ISignal<this, void>;

  readonly rejected: ISignal<this, void>;

  methods: string[] = [];

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    super.dispose();
    clearSignalData(this);
  }

  protected onIOPubMessage(sender: Kernel.IKernel, msg: KernelMessage.IIOPubMessage): boolean {
    let injected = super.onIOPubMessage(sender, msg);
    this.received.emit(void 0);
    if (injected) {
      this.injected.emit(void 0);
    } else {
      // If the message was not injected but otherwise would have been, emit
      // a rejected signal. This should only happen if `enabled` is `false`.
      let session = (msg.parent_header as KernelMessage.IHeader).session;
      let msgType = msg.header.msg_type;
      if (session !== this.kernel.clientId && relevantTypes.has(msgType)) {
        this.rejected.emit(void 0);
      }
    }
    return injected;
  }
}


defineSignal(TestHandler.prototype, 'injected');
defineSignal(TestHandler.prototype, 'received');
defineSignal(TestHandler.prototype, 'rejected');


const rendermime = defaultRenderMime();
const renderer: ForeignHandler.IRenderer = {
  createCell: () => {
    let renderer = CodeMirrorConsoleRenderer.defaultCodeCellRenderer;
    let cell = new CodeCellWidget({ rendermime, renderer });
    cell.model = new CodeCellModel();
    return cell;
  }
};


describe('console/foreign', () => {

  describe('ForeignHandler', () => {

    describe('#constructor()', () => {

      it('should create a new foreign handler', () => {
        let handler = new ForeignHandler({
          kernel: null,
          parent: null,
          renderer
        });
        expect(handler).to.be.a(ForeignHandler);
      });

    });

    describe('#enabled', () => {

      it('should default to `true`', () => {
        let handler = new ForeignHandler({
          kernel: null,
          parent: null,
          renderer
        });
        expect(handler.enabled).to.be(true);
      });

      it('should allow foreign cells to be injected if `true`', done => {
        let path = utils.uuid();
        let code = 'print("#enabled:true")';
        let parent = new Panel();
        Promise.all([
          Session.startNew({ path }), Session.startNew({ path })
        ]).then(([a, b]) => {
          let handler = new TestHandler({ kernel: a.kernel, parent, renderer });
          handler.injected.connect(() => {
            a.dispose();
            b.dispose();
            handler.dispose();
            done();
          });
          b.kernel.execute({ code, stop_on_error: true });
        }).catch(done);
      });

      it('should reject foreign cells if `false`', done => {
        let path = utils.uuid();
        let code = 'print("#enabled:false")';
        let parent = new Panel();
        Promise.all([
          Session.startNew({ path }), Session.startNew({ path })
        ]).then(([a, b]) => {
          let handler = new TestHandler({ kernel: a.kernel, parent, renderer });
          handler.enabled = false;
          handler.rejected.connect(() => {
            a.dispose();
            b.dispose();
            handler.dispose();
            done();
          });
          b.kernel.execute({ code, stop_on_error: true });
        }).catch(done);
      });

    });

    describe('#isDisposed', () => {

      it('should indicate whether the handler is disposed', () => {
        let handler = new ForeignHandler({
          kernel: null,
          parent: null,
          renderer
        });
        expect(handler.isDisposed).to.be(false);
        handler.dispose();
        expect(handler.isDisposed).to.be(true);
      });

    });

    describe('#kernel', () => {

      it('should be set upon instantiation', () => {
        let handler = new ForeignHandler({
          kernel: null,
          parent: null,
          renderer
        });
        expect(handler.kernel).to.be(null);
      });

      it('should be resettable', done => {
        let parent = new Panel();
        let handler = new TestHandler({ kernel: null, parent, renderer });
        Session.startNew({ path: utils.uuid() }).then(session => {
          expect(handler.kernel).to.be(null);
          handler.kernel = session.kernel;
          expect(handler.kernel).to.be(session.kernel);
          session.dispose();
          handler.dispose();
          done();
        }).catch(done);
      });

    });

    describe('#dispose()', () => {

      it('should dispose the resources held by the handler', () => {
        let handler = new ForeignHandler({
          kernel: null,
          parent: null,
          renderer
        });
        expect(handler.isDisposed).to.be(false);
        handler.dispose();
        expect(handler.isDisposed).to.be(true);
      });

      it('should be safe to call multiple times', () => {
        let handler = new ForeignHandler({
          kernel: null,
          parent: null,
          renderer
        });
        expect(handler.isDisposed).to.be(false);
        handler.dispose();
        handler.dispose();
        expect(handler.isDisposed).to.be(true);
      });

    });

    describe('#onIOPubMessage()', () => {

      it('should be called when messages come through', done => {
        let path = utils.uuid();
        let parent = new Panel();
        let code = 'print("onIOPubMessage:disabled")';
        Promise.all([
          Session.startNew({ path }), Session.startNew({ path })
        ]).then(([a, b]) => {
          let handler = new TestHandler({ kernel: a.kernel, parent, renderer });
          handler.enabled = false;
          handler.received.connect(() => {
            a.dispose();
            b.dispose();
            handler.dispose();
            done();
          });
          b.kernel.execute({ code, stop_on_error: true });
        }).catch(done);
      });

      it('should inject relevant cells into the parent', done => {
        let path = utils.uuid();
        let parent = new Panel();
        let code = 'print("onIOPubMessage:enabled")';
        Promise.all([
          Session.startNew({ path }), Session.startNew({ path })
        ]).then(([a, b]) => {
          let handler = new TestHandler({ kernel: a.kernel, parent, renderer });
          expect(parent.widgets.length).to.be(0);
          handler.injected.connect(() => {
            a.dispose();
            b.dispose();
            handler.dispose();
            expect(parent.widgets.length).to.be.greaterThan(0);
            done();
          });
          b.kernel.execute({ code, stop_on_error: true });
        }).catch(done);
      });

      it('should not reject relevant iopub messages', done => {
        let path = utils.uuid();
        let code = 'print("#onIOPubMessage:relevant")';
        let called = 0;
        let parent = new Panel();
        Promise.all([
          Session.startNew({ path }), Session.startNew({ path })
        ]).then(([a, b]) => {
          let handler = new TestHandler({ kernel: a.kernel, parent, renderer });
          handler.rejected.connect(() => {
            done(new Error('rejected relevant iopub message'));
          });
          handler.injected.connect(() => {
            if (++called === 2) {
              done();
            }
          });
          b.kernel.execute({ code, stop_on_error: true });
        }).catch(done);
      });

    });

  });

});
