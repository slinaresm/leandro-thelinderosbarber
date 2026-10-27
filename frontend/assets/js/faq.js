/* Native details remain readable and keyboard operable without JavaScript. */
(() => {
  const section = document.getElementById('preguntas-frecuentes');
  if (!section) return;
  const topics = section.querySelector('.faq-topics');
  const buttons = [...topics.querySelectorAll('button')];
  const answers = [...section.querySelectorAll('#faq-list > details')];
  const count = document.getElementById('faq-count');
  const labels = {todos:'Todas las preguntas',reservas:'Reservas',servicios:'Servicios',tienda:'Tienda y cuidado'};
  topics.hidden = false;
  buttons.forEach(button => button.addEventListener('click', () => {
    const topic = button.dataset.topic;
    buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    let visible = 0;
    answers.forEach(answer => {
      answer.hidden = topic !== 'todos' && answer.dataset.topic !== topic;
      if (!answer.hidden) visible++;
      else answer.open = false;
    });
    count.textContent = `${labels[topic]} · ${visible} ${visible === 1 ? 'respuesta' : 'respuestas'}`;
  }));
  answers.forEach(answer => answer.addEventListener('toggle', () => {
    if (answer.open) answers.forEach(other => { if (other !== answer) other.open = false; });
  }));
})();
