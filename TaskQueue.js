class TaskQueue {
    constructor(delay = 1000) {
        this.queue = [];
        this.running = false;
        this.delay = Math.max(delay, 500);
    }

    add(task) {
        return new Promise((resolve, reject) => {
            this.queue.push({
                task,
                resolve,
                reject
            });

            this.run();
        });
    }

    async run() {
        if (this.running) {
            return;
        }

        this.running = true;

        while (this.queue.length > 0) {
            const { task, resolve, reject } = this.queue.shift();

            try {
                const result = await task();
                resolve(result);
            } catch (error) {
                reject(error);
            }

            await new Promise(resolve =>
                setTimeout(resolve, this.delay)
            );
        }

        this.running = false;
    }
}